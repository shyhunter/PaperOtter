/**
 * Document converter orchestrator — routes conversions to LibreOffice or Calibre
 * sidecar commands via Tauri invoke().
 */

import { invoke } from '@tauri-apps/api/core';
import type {
  ConvertFormat,
  ConvertOptions,
  ConvertResult,
  ConverterEngine,
} from '@/types/converter';
import { DOCUMENT_FORMATS, EBOOK_FORMATS } from '@/types/converter';

// ── Engine routing ──────────────────────────────────────────────────────────

/** Returns which engine handles conversion TO the given output format. */
export function getEngineForFormat(format: ConvertFormat): ConverterEngine {
  if ((EBOOK_FORMATS as readonly string[]).includes(format)) return 'calibre';
  if ((DOCUMENT_FORMATS as readonly string[]).includes(format)) return 'libreoffice';
  return 'libreoffice'; // fallback
}

// ── Format availability matrix ──────────────────────────────────────────────

const ALL_FORMATS: ConvertFormat[] = [
  'pdf', 'docx', 'doc', 'odt', 'epub', 'mobi', 'azw3', 'txt', 'rtf',
];

/**
 * Returns the output formats available for a given input format.
 * Never returns the same format as input.
 */
export function getAvailableOutputFormats(inputFormat: ConvertFormat): ConvertFormat[] {
  // Filter out the input format itself
  const others = ALL_FORMATS.filter((f) => f !== inputFormat);

  switch (inputFormat) {
    case 'pdf':
      // PDF -> all non-PDF formats
      return others;

    case 'docx':
    case 'doc':
    case 'odt':
      // Document -> PDF + ebooks + other doc formats
      return others;

    case 'epub':
      // EPUB -> PDF, MOBI, AZW3, DOCX, TXT
      return ['pdf', 'mobi', 'azw3', 'docx', 'txt'].filter((f) => f !== inputFormat) as ConvertFormat[];

    case 'txt':
    case 'rtf':
      // Text/RTF -> PDF, DOCX, EPUB, ODT
      return ['pdf', 'docx', 'epub', 'odt'].filter((f) => f !== inputFormat) as ConvertFormat[];

    case 'mobi':
    case 'azw3':
      // Kindle -> EPUB, PDF
      return ['epub', 'pdf'];

    default:
      return others;
  }
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
    args.push('--line-height', String(options.lineSpacing));
  }

  // EPUB layout: fixed layout uses tablet output profile
  if (options.epubLayout === 'fixed') {
    args.push('--output-profile', 'tablet');
  }

  return args;
}

// ── Sidecar availability check ──────────────────────────────────────────────

let cachedAvailability: { libreoffice: boolean; calibre: boolean } | null = null;

/**
 * Checks whether LibreOffice and Calibre are installed and accessible.
 * Result is cached for the session (check once per app launch).
 */
export async function checkSidecarAvailability(): Promise<{
  libreoffice: boolean;
  calibre: boolean;
}> {
  if (cachedAvailability) return cachedAvailability;

  const [libreoffice, calibre] = await Promise.all([
    checkBinaryAvailable('libreoffice'),
    checkBinaryAvailable('calibre'),
  ]);

  cachedAvailability = { libreoffice, calibre };
  return cachedAvailability;
}

async function checkBinaryAvailable(engine: 'libreoffice' | 'calibre'): Promise<boolean> {
  try {
    // Use a lightweight conversion that will fail fast if the binary is missing,
    // but succeed if it's installed. We invoke the Rust command with a dummy
    // path that will fail at file-read time — but the error message differs
    // from "not found". If the binary is missing, the error says "not found".
    if (engine === 'libreoffice') {
      await invoke('convert_with_libreoffice', {
        sourcePath: '__papercut_probe__',
        outputFormat: 'pdf',
      });
    } else {
      await invoke('convert_with_calibre', {
        sourcePath: '__papercut_probe__',
        outputFormat: 'epub',
        extraArgs: [],
      });
    }
    // If we get here, it somehow worked (shouldn't happen with probe path)
    return true;
  } catch (err: unknown) {
    const message = typeof err === 'string' ? err : err instanceof Error ? err.message : '';
    // If error mentions "not found" or "failed to start", the binary is missing
    if (message.toLowerCase().includes('not found') || message.toLowerCase().includes('failed to start')) {
      return false;
    }
    // Any other error means the binary ran but failed (e.g., bad input path) — it's available
    return true;
  }
}

// ── Main conversion function ────────────────────────────────────────────────

/**
 * Convert a document from sourcePath to the format specified in options.
 * Routes to LibreOffice or Calibre based on output format.
 */
export async function convertDocument(
  sourcePath: string,
  _sourceFormat: ConvertFormat,
  options: ConvertOptions,
): Promise<ConvertResult> {
  const engine = getEngineForFormat(options.outputFormat);

  // For ebook outputs that need Calibre but source is a document format,
  // we may need a two-step conversion (doc -> pdf -> epub) if Calibre
  // can't handle the source directly. However, Calibre handles most
  // inputs natively, so we route directly.

  let outputBytes: Uint8Array;

  if (engine === 'calibre') {
    const extraArgs = buildCalibreArgs(options);
    outputBytes = await invoke<Uint8Array>('convert_with_calibre', {
      sourcePath,
      outputFormat: options.outputFormat,
      extraArgs,
    });
  } else {
    // LibreOffice handles document-to-document and document-to-PDF
    outputBytes = await invoke<Uint8Array>('convert_with_libreoffice', {
      sourcePath,
      outputFormat: options.outputFormat,
    });
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
