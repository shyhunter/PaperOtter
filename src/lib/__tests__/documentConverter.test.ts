// Engine-routing correctness. Regression guard for the PDF→DOCX bug where
// textutil (which cannot read PDF) was selected and dumped raw PDF bytes into
// the .docx. Engine selection must respect what each engine can *read*, not
// only what it can produce.

import { describe, it, expect } from 'vitest';
import { TOOL_REGISTRY } from '@/types/tools';
import {
  listAllOutputFormats,
  canAttemptConversion,
  requiredEngineFor,
  installableEnginesFor,
  requirementFor, getBestEngine, getAvailableOutputFormats, buildCalibreArgs } from '@/lib/documentConverter';
import type { ConverterAvailability } from '@/types/converter';

function avail(partial: Partial<ConverterAvailability>): ConverterAvailability {
  return {
    builtin: true,
    textutil: false,
    word: false,
    libreoffice: false,
    calibre: false,
    pandoc: false,
    webview: false,
    ...partial,
  };
}

// ── Calibre args must clear the Rust-side allow-list ───────────────────────

describe('[CALIBRE-ARGS-01] buildCalibreArgs unconditional flags', () => {
  // Reported from a real build: every Convert Document run through Calibre
  // failed with "Unsupported conversion option: --enable-heuristics".
  // buildCalibreArgs pushes --enable-heuristics and --unsmarten-punctuation on
  // every call, before any option is even read, but src-tauri/src/lib.rs's
  // CALIBRE_ALLOWED_FLAGS was written six days after this function and never
  // learned about either -- so every request this app ever sent through
  // Calibre was rejected by its own allow-list.
  //
  // Vitest cannot call into Rust, so this pins the TS side of the contract:
  // the exact unconditional prefix, so a flag added here without a matching
  // addition to CALIBRE_ALLOWED_FLAGS is a visible diff in this test rather
  // than a silent failure at conversion time.
  it('always sends exactly the flags CALIBRE_ALLOWED_FLAGS in lib.rs must allow', () => {
    expect(buildCalibreArgs({ outputFormat: 'epub' })).toEqual(['--enable-heuristics', '--unsmarten-punctuation']);
  });
});

describe('input-aware engine selection', () => {
  it('[BUG] PDF → DOCX uses the offline built-in engine, never textutil (which dumped raw bytes)', () => {
    // Only textutil available (typical macOS). Previously returned "textutil" → garbage;
    // it must never be chosen for a PDF, and built-in produces a real .docx offline.
    expect(getBestEngine('docx', avail({ textutil: true }), 'pdf')).toBe('builtin');
    // Even when flaky Word is present, built-in is preferred for PDF → DOCX (reliable, offline).
    expect(getBestEngine('docx', avail({ textutil: true, word: true }), 'pdf')).toBe('builtin');
  });

  it('ODT → DOCX (built-in cannot read ODT) falls back to a document engine', () => {
    expect(getBestEngine('docx', avail({ textutil: true }), 'odt')).toBe('textutil');
  });

  it('uses the built-in engine for PDF → plain text (works offline, no garbage)', () => {
    expect(getBestEngine('txt', avail({}), 'pdf')).toBe('builtin');
  });

  it('routes DOCX → TXT through the built-in engine (offline, structure-aware)', () => {
    expect(getBestEngine('txt', avail({ textutil: true }), 'docx')).toBe('builtin');
  });

  it('routes DOCX → RTF through textutil (built-in does not produce RTF)', () => {
    expect(getBestEngine('rtf', avail({ textutil: true }), 'docx')).toBe('textutil');
  });

  it('DOCX → PDF still works via a document engine', () => {
    expect(getBestEngine('pdf', avail({ libreoffice: true }), 'docx')).toBe('libreoffice');
  });

  it('[CR-BUG-03] HTML → PDF works via a document engine (regression: .html files could not be selected as source)', () => {
    expect(getBestEngine('pdf', avail({ libreoffice: true }), 'html')).toBe('libreoffice');
    expect(getBestEngine('pdf', avail({ word: true }), 'html')).toBe('word');
    expect(getBestEngine('pdf', avail({ calibre: true }), 'html')).toBe('calibre');
  });

  it('[CR-05] HTML → PDF prefers the native webview export over Word/LibreOffice/Calibre', () => {
    // webview renders like a real browser and needs no external app, so it wins
    // even when Word/LibreOffice/Calibre are also available.
    expect(
      getBestEngine('pdf', avail({ webview: true, word: true, libreoffice: true, calibre: true }), 'html'),
    ).toBe('webview');
  });

  it('[CR-05] webview is never selected for non-HTML sources (it can only render a real page, not convert one)', () => {
    expect(getBestEngine('pdf', avail({ webview: true }), 'docx')).not.toBe('webview');
    expect(getBestEngine('pdf', avail({ webview: true }), 'odt')).not.toBe('webview');
  });
});

describe('getAvailableOutputFormats is input-aware', () => {
  it('for a PDF with only textutil, offers built-in formats incl. docx, but NOT odt/rtf', () => {
    const formats = getAvailableOutputFormats('pdf', avail({ textutil: true }));
    // Built-in produces these offline from a PDF (docx included — it has a built-in renderer).
    expect(formats).toEqual(expect.arrayContaining(['md', 'html', 'json', 'txt', 'docx']));
    // No available engine can read a PDF into these, so they must not be offered (no garbage path).
    expect(formats).not.toContain('odt');
    expect(formats).not.toContain('rtf');
  });

  it('for a PDF with LibreOffice, odt becomes available', () => {
    expect(getAvailableOutputFormats('pdf', avail({ libreoffice: true }))).toContain('odt');
  });
});

/**
 * [CONV-10] A missing optional tool must not remove the whole feature.
 *
 * Reported from a real Linux build: "Convert Document" was greyed out on the
 * dashboard because Calibre was not installed. But Calibre is only needed for
 * EPUB, MOBI and AZW3 — PDF and DOCX convert to Markdown, HTML, JSON, TXT and
 * DOCX entirely in-process, needing nothing at all. The tool declared
 * `requiresDependency: 'calibre'`, which gates the card before any of the
 * per-format routing runs, so a whole working feature was unreachable.
 *
 * And the detection it was gating on is not reliable. On Linux it runs
 * `ebook-convert --version`, which only finds Calibre on PATH — a Flatpak or
 * Snap install (the common ones on Ubuntu) is a false negative. Blocking on a
 * detection that can be wrong is worse than attempting and reporting honestly.
 */
describe('convert-doc availability', () => {
  const nothingInstalled: ConverterAvailability = {
    builtin: true, textutil: false, word: false, libreoffice: false,
    calibre: false, pandoc: false, webview: false,
  };

  it('[CONV-10a] the built-in engine alone still produces five formats from a PDF', () => {
    const formats = getAvailableOutputFormats('pdf', nothingInstalled);
    for (const f of ['md', 'html', 'json'] as const) {
      expect(formats, `${f} needs no external tool`).toContain(f);
    }
    expect(formats.length, 'a bare machine can still convert').toBeGreaterThan(0);
  });

  it('[CONV-10b] listAllOutputFormats offers ebook formats even when Calibre is absent', () => {
    // Detection can be wrong (Flatpak/Snap), so the user decides, not us. The
    // format is offered and marked, rather than silently removed.
    const all = listAllOutputFormats('pdf', nothingInstalled);
    const epub = all.find((f) => f.format === 'epub');
    expect(epub, 'epub must still be offered').toBeDefined();
    expect(epub!.available, 'but marked unavailable').toBe(false);
    expect(epub!.needs, 'and it must name what it needs').toBe('calibre');
  });

  it('[CONV-10c] formats needing nothing are marked available on a bare machine', () => {
    const all = listAllOutputFormats('pdf', nothingInstalled);
    const md = all.find((f) => f.format === 'md');
    expect(md!.available).toBe(true);
    expect(md!.needs).toBeNull();
  });

  it('[CONV-10d] with Calibre present, epub is available and needs nothing further', () => {
    const withCalibre = { ...nothingInstalled, calibre: true };
    const all = listAllOutputFormats('pdf', withCalibre);
    const epub = all.find((f) => f.format === 'epub');
    expect(epub!.available).toBe(true);
    expect(epub!.needs).toBeNull();
  });

  it('[CONV-10f] the tool itself is not gated on an optional engine', () => {
    // This is the reported bug. Calibre is needed for three of eleven formats;
    // gating the dashboard card on it made the other eight unreachable.
    expect(
      TOOL_REGISTRY['convert-doc'].requiresDependency,
      'convert-doc must not be disabled wholesale for an optional engine',
    ).toBeUndefined();
  });

  it('[CONV-10e] never offers the input format as an output', () => {
    const all = listAllOutputFormats('pdf', nothingInstalled);
    expect(all.map((f) => f.format)).not.toContain('pdf');
  });
});

/**
 * [CONV-11] Offering a format and then refusing to run it is worse than not
 * offering it.
 *
 * CONV-10 made unverified formats selectable, because detection can be wrong
 * (Calibre via Flatpak or Snap is invisible to a PATH lookup). But the Convert
 * button stayed disabled for them: `canConvert` required
 * `getBestEngine(...) !== null`, which is null precisely when detection says the
 * engine is missing. So a user could pick EPUB, see it dimmed with "detection is
 * not always right — try it and see", and then find the button dead. The marking
 * was decoration and the dead end was still there, one step later.
 *
 * An offered format may always be attempted. If the tool really is absent, the
 * attempt fails with a message naming what is missing — which is information the
 * user can act on, unlike a disabled button.
 */
describe('attempting an unverified conversion', () => {
  const bare: ConverterAvailability = {
    builtin: true, textutil: false, word: false, libreoffice: false,
    calibre: false, pandoc: false, webview: false,
  };

  it('[CONV-11a] an offered-but-unverified format may still be attempted', () => {
    const options = listAllOutputFormats('pdf', bare);
    const epub = options.find((o) => o.format === 'epub');
    expect(epub!.available, 'precondition: epub is unverified here').toBe(false);
    expect(
      canAttemptConversion('epub', options),
      'an offered format must be attemptable, or marking it is decoration',
    ).toBe(true);
  });

  it('[CONV-11b] a format that was never offered cannot be attempted', () => {
    const options = listAllOutputFormats('pdf', bare);
    expect(canAttemptConversion('pdf', options), 'the input format is not an output').toBe(false);
  });

  it('[CONV-11c] the required engine is named accurately per format', () => {
    // The old error said "Install LibreOffice or Microsoft Word" for everything,
    // which is simply wrong for an ebook format.
    expect(requiredEngineFor('epub', 'pdf')).toBe('calibre');
    expect(requiredEngineFor('mobi', 'pdf')).toBe('calibre');
    expect(requiredEngineFor('md', 'pdf')).toBe('builtin');
  });

  it('[CONV-11d] a genuinely impossible pairing has no required engine', () => {
    // Markdown from EPUB: only the built-in engine writes Markdown and it
    // cannot read EPUB, so no install fixes it.
    expect(requiredEngineFor('md', 'epub')).toBeNull();
  });
});

/**
 * [CONV-12] Name tools the user can actually install, and do not name one when
 * several would do.
 *
 * requiredEngineFor returns the first engine in the priority list, which made
 * two misleading messages:
 *
 *   PDF  -> RTF/DOC/ODT  said "needs Microsoft Word", when LibreOffice does it
 *                        too, is free, and runs everywhere. Telling a Linux
 *                        user to buy Word is bad advice.
 *   DOCX -> RTF/DOC/ODT  said "needs textutil", which is a macOS built-in. A
 *                        Linux user cannot install it at all, so the message
 *                        named something unobtainable.
 */
describe('naming the tool a user could install', () => {
  it('[CONV-12a] on Linux, never names macOS-only engines', () => {
    for (const fmt of ['rtf', 'doc', 'odt'] as const) {
      const engines = installableEnginesFor(fmt, 'docx', 'linux');
      expect(engines, `${fmt} must not suggest textutil on Linux`).not.toContain('textutil');
      expect(engines, `${fmt} must not suggest Word on Linux`).not.toContain('word');
    }
  });

  it('[CONV-12b] on Linux, LibreOffice is offered for the office formats', () => {
    for (const fmt of ['rtf', 'doc', 'odt'] as const) {
      expect(installableEnginesFor(fmt, 'docx', 'linux')).toContain('libreoffice');
    }
  });

  it('[CONV-12c] names every engine that would work, not just the first', () => {
    // PDF -> RTF: Word and LibreOffice both do it. On a Mac both are nameable.
    const onMac = installableEnginesFor('rtf', 'pdf', 'macos');
    expect(onMac.length, 'more than one engine can do this').toBeGreaterThan(1);
    expect(onMac).toContain('libreoffice');
  });

  it('[CONV-12d] EPUB still names Calibre alone, because it is alone', () => {
    expect(installableEnginesFor('epub', 'pdf', 'linux')).toEqual(['calibre']);
  });

  it('[CONV-12e] an impossible pairing names nothing', () => {
    expect(installableEnginesFor('md', 'epub', 'linux')).toEqual([]);
  });

  it('[CONV-12f] Word is nameable on Windows, where it exists', () => {
    expect(installableEnginesFor('rtf', 'pdf', 'windows')).toContain('word');
  });
});

/**
 * [CONV-13] Say what kind of program is needed, not one product's name.
 *
 * "Converting PDF to RTF needs Microsoft Word" is wrong twice over: it names a
 * paid product when a free one does the same job, and it implies only that
 * product will do. What the user needs is the category and some examples, so
 * they can use whatever they already have.
 */
describe('describing what to install', () => {
  it('[CONV-13a] office formats ask for a word processor, free option first', () => {
    const req = requirementFor('rtf', 'pdf', 'windows');
    expect(req!.kind).toBe('wordProcessor');
    expect(req!.examples[0], 'suggest the free cross-platform one first').toBe('LibreOffice');
    expect(req!.examples).toContain('Microsoft Word');
  });

  it('[CONV-13b] on Linux it never suggests Word, which cannot run there', () => {
    const req = requirementFor('rtf', 'pdf', 'linux');
    expect(req!.examples).toEqual(['LibreOffice']);
  });

  it('[CONV-13c] ebook formats ask for an ebook converter', () => {
    const req = requirementFor('epub', 'pdf', 'linux');
    expect(req!.kind).toBe('ebookConverter');
    expect(req!.examples).toContain('Calibre');
  });

  it('[CONV-13d] nothing to install when the OS already provides it', () => {
    // DOCX -> RTF goes through textutil on macOS, which ships with the system.
    expect(requirementFor('rtf', 'docx', 'macos')).toBeNull();
  });

  it('[CONV-13e] nothing to install when the built-in engine handles it', () => {
    expect(requirementFor('md', 'pdf', 'linux')).toBeNull();
  });

  it('[CONV-13f] nothing to suggest for an impossible pairing', () => {
    expect(requirementFor('md', 'epub', 'linux')).toBeNull();
  });
});
