/**
 * Document converter orchestrator — priority-based engine chain.
 *
 * Instead of requiring specific tools, silently uses the best available:
 *   1. textutil  (macOS built-in — always available on Mac)
 *   2. Word      (Microsoft Word via AppleScript/COM if installed)
 *   3. LibreOffice (if installed)
 *   4. Calibre   (for ebook formats, if installed)
 *
 * Never tells the user to "install X" — only shows what's possible with
 * whatever they already have on their machine.
 */

import { invoke } from '@tauri-apps/api/core';
import { currentPlatform, type Platform } from '@/lib/platform';
import type {
  ConvertFormat,
  ConvertOptions,
  ConvertResult,
  ConverterEngine,
  ConverterAvailability,
} from '@/types/converter';
import { BUILTIN_OUTPUT_FORMATS, BUILTIN_INPUT_FORMATS } from '@/types/converter';
import { convertWithBuiltin, type BuiltinFormat } from '@/lib/documentBuiltin';
import { t } from '@/i18n';

// ── Engine detection ────────────────────────────────────────────────────────

let cachedAvailability: ConverterAvailability | null = null;

/**
 * Detect which conversion backends are available on this system.
 * Result is cached — runs detection once per app launch.
 */
export async function detectConverters(): Promise<ConverterAvailability> {
  if (cachedAvailability) return cachedAvailability;

  try {
    const json = await invoke<string>('detect_converters');
    const parsed = JSON.parse(json) as Record<string, boolean>;
    cachedAvailability = {
      builtin: true, // in-process engine — always available, no external tool
      textutil: parsed.textutil ?? false,
      word: parsed.word ?? false,
      libreoffice: parsed.libreoffice ?? false,
      calibre: parsed.calibre ?? false,
      pandoc: parsed.pandoc ?? false,
      webview: parsed.webview ?? false,
    };
  } catch {
    cachedAvailability = {
      builtin: true, // still available even if system-tool detection fails
      textutil: false,
      word: false,
      libreoffice: false,
      calibre: false,
      pandoc: false,
      webview: false,
    };
  }

  return cachedAvailability;
}

/** Backward-compat alias */
export async function checkSidecarAvailability(): Promise<{
  libreoffice: boolean;
  calibre: boolean;
}> {
  const avail = await detectConverters();
  return { libreoffice: avail.libreoffice, calibre: avail.calibre };
}

// ── Engine routing ──────────────────────────────────────────────────────────

/** Format -> supported engines lookup (in priority order). */
const ENGINE_SUPPORT: Record<ConvertFormat, ConverterEngine[]> = {
  txt:  ['builtin', 'textutil', 'word', 'libreoffice'],
  rtf:  ['textutil', 'word', 'libreoffice'],
  doc:  ['textutil', 'word', 'libreoffice'],
  docx: ['builtin', 'textutil', 'word', 'libreoffice'],
  odt:  ['textutil', 'word', 'libreoffice'],
  // webview first: for an HTML source it renders like a real browser and needs
  // no external app — falls through to word/libreoffice/calibre for other inputs.
  pdf:  ['webview', 'word', 'libreoffice', 'calibre'],
  epub: ['calibre'],
  mobi: ['calibre'],
  azw3: ['calibre'],
  md:   ['builtin'],
  html: ['builtin'],
  json: ['builtin'],
};

/**
 * Which input formats each engine can *read*. Selection must respect this:
 * e.g. textutil cannot parse a PDF, so handing it one produces a file full of
 * raw PDF bytes instead of a real conversion. Output support alone is not enough.
 */
const ENGINE_INPUT_SUPPORT: Record<ConverterEngine, ConvertFormat[]> = {
  builtin:     ['pdf', 'docx'],
  textutil:    ['txt', 'rtf', 'doc', 'docx', 'odt', 'html'],
  word:        ['pdf', 'docx', 'doc', 'rtf', 'txt', 'odt', 'html'],
  libreoffice: ['pdf', 'docx', 'doc', 'odt', 'txt', 'rtf', 'html'],
  calibre:     ['epub', 'mobi', 'azw3', 'pdf', 'docx', 'odt', 'rtf', 'txt', 'html'],
  pandoc:      ['docx', 'odt', 'html', 'md', 'rtf', 'txt', 'epub'],
  // Renders the source itself, not a converted copy — only a real browser page (HTML) applies.
  webview:     ['html'],
};

/**
 * Find the best available engine for a given output format.
 * Returns null if no engine can handle it.
 */
export function getBestEngine(
  outputFormat: ConvertFormat,
  availability: ConverterAvailability,
  inputFormat?: ConvertFormat,
): ConverterEngine | null {
  const candidates = ENGINE_SUPPORT[outputFormat] ?? [];
  for (const engine of candidates) {
    if (!availability[engine]) continue;
    // The engine must also be able to *read* the source — otherwise it emits garbage.
    if (inputFormat && !ENGINE_INPUT_SUPPORT[engine].includes(inputFormat)) continue;
    return engine;
  }
  return null;
}

/** Returns which engine handles conversion TO the given output format (legacy compat). */
export function getEngineForFormat(format: ConvertFormat): ConverterEngine {
  // Legacy function — returns first engine in priority list regardless of availability
  const candidates = ENGINE_SUPPORT[format] ?? [];
  return candidates[0] ?? 'libreoffice';
}

// ── Format availability ─────────────────────────────────────────────────────

const ALL_FORMATS: ConvertFormat[] = [
  'pdf', 'docx', 'doc', 'odt', 'epub', 'mobi', 'azw3', 'txt', 'rtf',
  'md', 'html', 'json',
];

/**
 * Returns the output formats available for a given input format,
 * filtered to only formats that at least one available engine can produce.
 */
export function getAvailableOutputFormats(
  inputFormat: ConvertFormat,
  availability?: ConverterAvailability,
): ConvertFormat[] {
  // All formats except the input format itself
  let candidates = ALL_FORMATS.filter((f) => f !== inputFormat);

  // Built-in (in-process) formats are only producible from inputs the engine can read.
  if (!BUILTIN_INPUT_FORMATS.includes(inputFormat)) {
    candidates = candidates.filter((f) => !BUILTIN_OUTPUT_FORMATS.includes(f));
  }

  // If we know what's available, filter to only formats some engine can both
  // read the input as AND produce (input-aware — no dead/garbage options).
  if (availability) {
    candidates = candidates.filter((fmt) => getBestEngine(fmt, availability, inputFormat) !== null);
  }

  return candidates;
}

/** Human names for engines, for telling a user what a format would need.
 *  Product names, deliberately untranslated — "Calibre" is Calibre everywhere. */
export const ENGINE_LABELS: Record<ConverterEngine, string> = {
  builtin: 'the built-in engine',
  textutil: 'textutil',
  word: 'Microsoft Word',
  libreoffice: 'LibreOffice',
  calibre: 'Calibre',
  pandoc: 'Pandoc',
  webview: 'the system webview',
};

/** One output format, with whether this machine can currently produce it. */
export interface OutputFormatOption {
  format: ConvertFormat;
  /** True when some detected engine can read this input and write this format. */
  available: boolean;
  /** The engine it would need but which was not detected, or null when available. */
  needs: ConverterEngine | null;
}

/** Every engine present — used to ask "could this ever work?" rather than "does it now?". */
const EVERYTHING: ConverterAvailability = {
  builtin: true, textutil: true, word: true, libreoffice: true,
  calibre: true, pandoc: true, webview: true,
};

/**
 * Every output format worth offering for this input, each marked with whether
 * this machine can produce it right now.
 *
 * Different from getAvailableOutputFormats, which removes what it cannot do.
 * Removing is wrong for an optional tool, for two reasons.
 *
 * Detection is not reliable. On Linux Calibre is found by running
 * `ebook-convert --version`, which only sees it on PATH — a Flatpak or Snap
 * install, the common ones on Ubuntu, reads as absent. Silently deleting EPUB
 * from the list denies a capability the user may well have.
 *
 * And an absent optional tool is something the user can act on, unlike a
 * missing platform engine. The registry already draws that line:
 * requiresPlatform hides, requiresDependency shows-and-explains. This is the
 * second kind, at format granularity instead of whole-tool.
 *
 * What it still drops is what no engine could produce even fully equipped —
 * Markdown from an EPUB, say, since only the built-in engine writes Markdown
 * and it cannot read EPUB. Offering that would be a dead end no install fixes.
 */
export function listAllOutputFormats(
  inputFormat: ConvertFormat,
  availability: ConverterAvailability,
): OutputFormatOption[] {
  return ALL_FORMATS
    .filter((format) => format !== inputFormat)
    .map((format) => {
      const possible = getBestEngine(format, EVERYTHING, inputFormat);
      if (!possible) return null;
      const actual = getBestEngine(format, availability, inputFormat);
      return { format, available: actual !== null, needs: actual ? null : possible };
    })
    .filter((o): o is OutputFormatOption => o !== null);
}

/**
 * Which platforms each engine can exist on at all.
 *
 * Naming a tool the user cannot install is worse than naming none: `textutil`
 * is a macOS built-in, so telling a Linux user their conversion "needs
 * textutil" sends them looking for something that does not exist for them.
 */
const ENGINE_PLATFORMS: Record<ConverterEngine, readonly Platform[]> = {
  builtin: ['macos', 'windows', 'linux'],
  textutil: ['macos'],
  word: ['macos', 'windows'],
  libreoffice: ['macos', 'windows', 'linux'],
  calibre: ['macos', 'windows', 'linux'],
  pandoc: ['macos', 'windows', 'linux'],
  webview: ['macos'],
};

/**
 * Every engine that could produce this conversion and could exist on this
 * platform, in priority order.
 *
 * Two things this fixes over naming `requiredEngineFor`'s single answer.
 *
 * It named only the first candidate, so PDF to RTF reported "needs Microsoft
 * Word" when LibreOffice does it too — free, cross-platform, and the better
 * suggestion for most people. Telling someone to buy Word when a free tool
 * would do is bad advice, not merely incomplete.
 *
 * And it ignored platform, so DOCX to RTF reported "needs textutil" on Linux,
 * where textutil cannot be installed by anyone.
 */
export function installableEnginesFor(
  outputFormat: ConvertFormat,
  inputFormat: ConvertFormat | undefined,
  platform: Platform,
): ConverterEngine[] {
  return (ENGINE_SUPPORT[outputFormat] ?? []).filter((engine) => {
    if (!ENGINE_PLATFORMS[engine].includes(platform)) return false;
    // The engine must also be able to read the source, or it is not a candidate.
    if (inputFormat && !ENGINE_INPUT_SUPPORT[engine].includes(inputFormat)) return false;
    return true;
  });
}

/** "A", "A or B", "A, B or C" — plain English list for an untranslated error. */
export function joinOr(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`;
}

/** What *kind* of program a conversion needs, when it needs an external one. */
export type RequirementKind = 'wordProcessor' | 'ebookConverter';

export interface ConversionRequirement {
  kind: RequirementKind;
  /** Programs that would satisfy it, free and cross-platform ones first. */
  examples: string[];
}

/** Engines that come with the operating system or with Papercut, so are never
 *  something a user installs. If one of these can do the job, say nothing. */
const OS_PROVIDED: readonly ConverterEngine[] = ['builtin', 'textutil', 'webview'];

/** Which kind each engine belongs to, for describing what is missing. */
const ENGINE_KIND: Partial<Record<ConverterEngine, RequirementKind>> = {
  textutil: 'wordProcessor',
  word: 'wordProcessor',
  libreoffice: 'wordProcessor',
  calibre: 'ebookConverter',
  pandoc: 'ebookConverter',
};

/**
 * Engines a user could actually go and install, with the name they would
 * recognise. Ordered so the free, cross-platform option is suggested first —
 * telling someone to buy Word when LibreOffice would do is bad advice.
 *
 * `textutil` and `webview` are absent on purpose: they ship with the operating
 * system, so they are never something to install. `builtin` is ours.
 */
const INSTALLABLE: readonly { engine: ConverterEngine; name: string }[] = [
  { engine: 'libreoffice', name: 'LibreOffice' },
  { engine: 'word', name: 'Microsoft Word' },
  { engine: 'calibre', name: 'Calibre' },
  { engine: 'pandoc', name: 'Pandoc' },
];

/**
 * What this conversion needs, described as a kind of program rather than one
 * product name.
 *
 * "Needs Microsoft Word" is wrong twice: it names a paid product when a free
 * one does the same job, and it implies only that product will do. What a user
 * needs to know is the category — a word processor, an ebook converter — and
 * some examples they can pick from with whatever they already have.
 *
 * Returns null when nothing needs installing, either because the built-in
 * engine handles it or because no program could.
 */
export function requirementFor(
  outputFormat: ConvertFormat,
  inputFormat: ConvertFormat | undefined,
  platform: Platform,
): ConversionRequirement | null {
  const engines = installableEnginesFor(outputFormat, inputFormat, platform);
  if (engines.length === 0) return null;
  // If anything the OS already ships can do it, there is nothing to install and
  // nothing to say. macOS converts DOCX to RTF with textutil, which is part of
  // the system -- suggesting LibreOffice there would be noise.
  if (engines.some((e) => OS_PROVIDED.includes(e))) return null;

  const kind = ENGINE_KIND[engines[0]]!;
  const examples = INSTALLABLE
    .filter(({ engine }) => engines.includes(engine) && ENGINE_KIND[engine] === kind)
    .map(({ name }) => name);

  return examples.length > 0 ? { kind, examples } : null;
}

/**
 * Which engine this conversion needs, assuming everything were installed.
 * Null when no engine could ever do it, so no install would help.
 */
export function requiredEngineFor(
  outputFormat: ConvertFormat,
  inputFormat?: ConvertFormat,
): ConverterEngine | null {
  return getBestEngine(outputFormat, EVERYTHING, inputFormat);
}

/**
 * Whether the user may press Convert for this format.
 *
 * Any format that was offered may be attempted, including one detection could
 * not verify. Offering a format and then disabling the button is worse than not
 * offering it at all: it moves the dead end one step later and tells the user
 * nothing. If the tool really is absent the attempt fails with a message naming
 * it, which is something they can act on.
 */
export function canAttemptConversion(
  outputFormat: ConvertFormat,
  offered: OutputFormatOption[],
): boolean {
  return offered.some((o) => o.format === outputFormat);
}

/**
 * Check if ANY conversion is possible with the tools available.
 * Returns true if at least one engine is available.
 */
export function hasAnyConverter(availability: ConverterAvailability): boolean {
  return Object.values(availability).some(Boolean);
}

/**
 * Get a human-readable summary of available conversion capabilities.
 * Used in the UI to show what the user can do without installing anything extra.
 */
export function getCapabilitySummary(availability: ConverterAvailability): string {
  // Product names stay as they are: Calibre is Calibre in every language, and
  // translating one would make it harder to go and find, not easier. Only the
  // words around them are text.
  const engines: string[] = [];
  if (availability.builtin) engines.push(t('documentConverter.engineBuiltIn'));
  if (availability.webview) engines.push(t('documentConverter.engineBrowser'));
  if (availability.textutil) engines.push(t('documentConverter.engineTextutil'));
  if (availability.word) engines.push('Microsoft Word');
  if (availability.libreoffice) engines.push('LibreOffice');
  if (availability.calibre) engines.push('Calibre');
  if (availability.pandoc) engines.push('Pandoc');
  if (engines.length === 0) return t('documentConverter.noConversionToolsDetected');
  return t('documentConverter.usingEngines', { engines: engines.join(', ') });
}

// ── Calibre CLI argument builder ────────────────────────────────────────────

/** Maps ConvertOptions to Calibre CLI flags (extra_args). */
export function buildCalibreArgs(options: ConvertOptions): string[] {
  const args: string[] = [];

  if (options.fontSize != null) {
    args.push('--base-font-size', String(options.fontSize));
  }

  if (options.marginTop != null) {
    args.push('--margin-top', String(options.marginTop));
  }
  if (options.marginRight != null) {
    args.push('--margin-right', String(options.marginRight));
  }
  if (options.marginBottom != null) {
    args.push('--margin-bottom', String(options.marginBottom));
  }
  if (options.marginLeft != null) {
    args.push('--margin-left', String(options.marginLeft));
  }

  if (options.lineSpacing != null) {
    const baseFontSize = options.fontSize ?? 12;
    const lineHeightPt = Math.round(options.lineSpacing * baseFontSize);
    args.push('--line-height', String(lineHeightPt));
  }

  args.push('--enable-heuristics');
  args.push('--unsmarten-punctuation');

  if (options.epubLayout === 'fixed') {
    args.push('--output-profile', 'tablet');
  }

  return args;
}

// ── Main conversion function ────────────────────────────────────────────────

/**
 * Convert a document using the best available engine.
 * Silently picks the right tool — never asks the user to install anything.
 */
export async function convertDocument(
  sourcePath: string,
  sourceFormat: ConvertFormat,
  options: ConvertOptions,
): Promise<ConvertResult> {
  const availability = await detectConverters();
  const engine = getBestEngine(options.outputFormat, availability, sourceFormat);

  if (!engine) {
    // Name the tool this conversion actually needs. The old message said
    // "Install LibreOffice or Microsoft Word" for everything, which is simply
    // wrong for an ebook format and sends the user to install the wrong thing.
    const pair = `${sourceFormat.toUpperCase()} to ${options.outputFormat.toUpperCase()}`;
    const req = requirementFor(options.outputFormat, sourceFormat, currentPlatform());
    if (!req) throw new Error(`Papercut cannot convert ${pair}.`);
    const kind = req.kind === 'ebookConverter' ? 'an ebook converter' : 'a word processor';
    throw new Error(
      `Converting ${pair} needs ${kind} such as ${joinOr(req.examples)}, ` +
      `which could not be found on this system.`,
    );
  }

  const { readFile } = await import('@tauri-apps/plugin-fs');

  // Built-in in-process engine: read the file and convert entirely in JS.
  if (engine === 'builtin') {
    const sourceBytes = await readFile(sourcePath);
    const { bytes, archive } = await convertWithBuiltin(
      sourceBytes,
      sourceFormat,
      options.outputFormat as BuiltinFormat,
      options.splitByChapter ?? false,
    );
    return {
      outputBytes: bytes,
      outputFormat: options.outputFormat,
      originalSize: sourceBytes.byteLength,
      outputSize: bytes.byteLength,
      archive,
    };
  }

  let outputBytes: Uint8Array;

  switch (engine) {
    case 'webview':
      outputBytes = await invoke<Uint8Array>('convert_html_to_pdf_native', {
        sourcePath,
      });
      break;

    case 'textutil':
      outputBytes = await invoke<Uint8Array>('convert_with_textutil', {
        sourcePath,
        outputFormat: options.outputFormat,
      });
      break;

    case 'word':
      outputBytes = await invoke<Uint8Array>('convert_with_word', {
        sourcePath,
        outputFormat: options.outputFormat,
      });
      break;

    case 'libreoffice':
      outputBytes = await invoke<Uint8Array>('convert_with_libreoffice', {
        sourcePath,
        outputFormat: options.outputFormat,
      });
      break;

    case 'calibre': {
      const extraArgs = buildCalibreArgs(options);
      outputBytes = await invoke<Uint8Array>('convert_with_calibre', {
        sourcePath,
        outputFormat: options.outputFormat,
        extraArgs,
      });
      break;
    }

    default:
      throw new Error(`Unknown engine: ${engine}`);
  }

  // Get original file size
  const sourceBytes = await readFile(sourcePath);
  const originalSize = sourceBytes.byteLength;

  return {
    outputBytes: new Uint8Array(outputBytes),
    outputFormat: options.outputFormat,
    originalSize,
    outputSize: outputBytes.byteLength,
  };
}
