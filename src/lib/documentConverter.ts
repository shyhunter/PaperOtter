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
import type {
  ConvertFormat,
  ConvertOptions,
  ConvertResult,
  ConverterEngine,
  ConverterAvailability,
} from '@/types/converter';

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
      textutil: parsed.textutil ?? false,
      word: parsed.word ?? false,
      libreoffice: parsed.libreoffice ?? false,
      calibre: parsed.calibre ?? false,
      pandoc: parsed.pandoc ?? false,
    };
  } catch {
    cachedAvailability = {
      textutil: false,
      word: false,
      libreoffice: false,
      calibre: false,
      pandoc: false,
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
  txt:  ['textutil', 'word', 'libreoffice'],
  rtf:  ['textutil', 'word', 'libreoffice'],
  doc:  ['textutil', 'word', 'libreoffice'],
  docx: ['textutil', 'word', 'libreoffice'],
  odt:  ['textutil', 'word', 'libreoffice'],
  pdf:  ['word', 'libreoffice', 'calibre'],
  epub: ['calibre'],
  mobi: ['calibre'],
  azw3: ['calibre'],
};

/**
 * Find the best available engine for a given output format.
 * Returns null if no engine can handle it.
 */
export function getBestEngine(
  outputFormat: ConvertFormat,
  availability: ConverterAvailability,
): ConverterEngine | null {
  const candidates = ENGINE_SUPPORT[outputFormat] ?? [];
  for (const engine of candidates) {
    if (availability[engine]) return engine;
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

  // If we know what's available, filter to only producible formats
  if (availability) {
    candidates = candidates.filter((fmt) => getBestEngine(fmt, availability) !== null);
  }

  return candidates;
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
  const engines: string[] = [];
  if (availability.textutil) engines.push('textutil (built-in)');
  if (availability.word) engines.push('Microsoft Word');
  if (availability.libreoffice) engines.push('LibreOffice');
  if (availability.calibre) engines.push('Calibre');
  if (availability.pandoc) engines.push('Pandoc');
  if (engines.length === 0) return 'No conversion tools detected.';
  return `Using: ${engines.join(', ')}`;
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
  _sourceFormat: ConvertFormat,
  options: ConvertOptions,
): Promise<ConvertResult> {
  const availability = await detectConverters();
  const engine = getBestEngine(options.outputFormat, availability);

  if (!engine) {
    throw new Error(
      `No conversion tool available for ${options.outputFormat.toUpperCase()} output. ` +
      `Install any document converter (LibreOffice, Microsoft Word, etc.) to enable this.`
    );
  }

  let outputBytes: Uint8Array;

  switch (engine) {
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
  const { readFile } = await import('@tauri-apps/plugin-fs');
  const sourceBytes = await readFile(sourcePath);
  const originalSize = sourceBytes.byteLength;

  return {
    outputBytes: new Uint8Array(outputBytes),
    outputFormat: options.outputFormat,
    originalSize,
    outputSize: outputBytes.byteLength,
  };
}
