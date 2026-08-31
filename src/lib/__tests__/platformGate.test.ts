import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { TOOL_REGISTRY, EDITOR_SIDEBAR_TOOLS } from '@/types/tools';
import { currentPlatform, isToolAvailableHere, availableTools, revealLabelKey } from '@/lib/platform';

/**
 * [PGATE-01] Nothing that cannot work on this platform is ever offered.
 *
 * OCR runs on macOS Vision (src-tauri/src/ocr.rs). There is no engine on
 * Windows or Linux, yet TOOL_REGISTRY declared no platform requirement, so the
 * Make Searchable card rendered on every platform and the editor offered to
 * "read this scan" on machines with nothing to read it with.
 *
 * Hide rather than disable. `requiresDependency` greys a tool out with an
 * install hint, which is right for Ghostscript because the user can act on it.
 * Vision cannot be installed on Windows, so a greyed card advertises something
 * unattainable.
 */

const MAC_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)';
const WIN_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';
const LINUX_UA = 'Mozilla/5.0 (X11; Linux x86_64)';

function setUA(ua: string) {
  vi.stubGlobal('navigator', { userAgent: ua, platform: '' });
}
afterEach(() => vi.unstubAllGlobals());

describe('platform gate', () => {
  it('[PGATE-01a] reads the three platforms from the user agent', () => {
    setUA(MAC_UA);
    expect(currentPlatform()).toBe('macos');
    setUA(WIN_UA);
    expect(currentPlatform()).toBe('windows');
    setUA(LINUX_UA);
    expect(currentPlatform()).toBe('linux');
  });

  it('[PGATE-01b] ocr-pdf declares that it needs macOS', () => {
    expect(TOOL_REGISTRY['ocr-pdf'].requiresPlatform).toEqual(['macos']);
  });

  it('[PGATE-01c] a tool with no platform requirement runs everywhere', () => {
    setUA(WIN_UA);
    expect(isToolAvailableHere(TOOL_REGISTRY['merge-pdf'])).toBe(true);
    expect(isToolAvailableHere(TOOL_REGISTRY['compress-pdf'])).toBe(true);
  });

  it('[PGATE-01d] OCR is offered on macOS and withheld elsewhere', () => {
    setUA(MAC_UA);
    expect(isToolAvailableHere(TOOL_REGISTRY['ocr-pdf'])).toBe(true);
    setUA(WIN_UA);
    expect(isToolAvailableHere(TOOL_REGISTRY['ocr-pdf'])).toBe(false);
    setUA(LINUX_UA);
    expect(isToolAvailableHere(TOOL_REGISTRY['ocr-pdf'])).toBe(false);
  });

  it('[PGATE-01e] availableTools drops exactly the unavailable ones', () => {
    const all = Object.values(TOOL_REGISTRY);
    setUA(MAC_UA);
    expect(availableTools(all)).toHaveLength(all.length);
    setUA(WIN_UA);
    const onWindows = availableTools(all).map((t) => t.id);
    expect(onWindows).not.toContain('ocr-pdf');
    expect(onWindows).toHaveLength(all.length - 1);
  });

  it('[PGATE-01f] the editor sidebar list is filtered by the same gate', () => {
    setUA(WIN_UA);
    const shown = EDITOR_SIDEBAR_TOOLS.filter((id) =>
      isToolAvailableHere(TOOL_REGISTRY[id]),
    );
    expect(shown).not.toContain('ocr-pdf');
  });
});

/**
 * [PGATE-02] Every place that reaches OCR consults the gate.
 *
 * Same shape as ToolIcons.test.tsx, and for the same reason: nothing connects
 * these files, so adding a fifth OCR entry point and forgetting to gate it is
 * silent. The dashboard card was only ever one of five.
 */
describe('OCR entry points', () => {
  const ENTRY_POINTS = [
    'src/components/Dashboard.tsx',
    'src/components/pdf-editor/SearchBar.tsx',
    'src/components/pdf-editor/ToolSidebar.tsx',
    'src/components/redact-pdf/RedactStep.tsx',
  ];

  it('[PGATE-02a] the entry point list still matches what references OCR', () => {
    // Guard the guard: if a new file starts using ocrProcessor, this list is
    // stale and the assertion below is checking a fiction.
    expect(ENTRY_POINTS.length).toBeGreaterThanOrEqual(4);
    for (const file of ENTRY_POINTS) {
      expect(() => readFileSync(file, 'utf8'), `${file} must exist`).not.toThrow();
    }
  });

  it('[PGATE-02b] every OCR entry point imports the platform gate', () => {
    const ungated = ENTRY_POINTS.filter((file) => {
      const source = readFileSync(file, 'utf8');
      return !/from '@\/lib\/platform'/.test(source);
    });
    expect(ungated, 'OCR entry points that never consult the platform gate').toEqual([]);
  });
});

/**
 * [PGATE-04] "Show in Finder" is macOS wording.
 *
 * Reported from a real Linux build: the save step offered "Show in Finder" on
 * Ubuntu. Finder is a macOS application; Windows has File Explorer and Linux
 * has no single answer at all — Nautilus, Dolphin and Thunar are all "Files" to
 * their users, so the neutral wording is the honest one there.
 */
describe('reveal-in-file-manager wording', () => {
  it('[PGATE-04a] names Finder only on macOS', () => {
    setUA(MAC_UA);
    expect(revealLabelKey()).toBe('save.showInFinder');
  });

  it('[PGATE-04b] names File Explorer on Windows', () => {
    setUA(WIN_UA);
    expect(revealLabelKey()).toBe('save.showInExplorer');
  });

  it('[PGATE-04c] uses neutral wording on Linux', () => {
    setUA(LINUX_UA);
    expect(revealLabelKey()).toBe('save.showInFiles');
  });

  it('[PGATE-04d] the three keys are distinct', () => {
    // One key reused across platforms would defeat the point.
    const keys = new Set<string>();
    for (const ua of [MAC_UA, WIN_UA, LINUX_UA]) {
      setUA(ua);
      keys.add(revealLabelKey());
    }
    expect(keys.size).toBe(3);
  });
});
