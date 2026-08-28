// Shared utility functions extracted for testability.
// Used by ConfigureStep.tsx (and potentially CompareStep.tsx).
import { formatNumber } from '@/i18n';
import { t } from '@/i18n';

/**
 * Convert a raw PDF parsing/loading error into a short, user-friendly message.
 * The raw errors from pdf-lib (e.g. "Failed to parse PDF document (line:10443
 * col:114 offset=1693099): No PDF header found") are not actionable for users.
 */
export function friendlyPdfError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);

  // Checked before the corruption branches: a blocked read says nothing about
  // the file's contents, and telling someone their visa scan is corrupt when it
  // is merely out of scope sends them looking for a problem that is not there.
  if (/forbidden path/i.test(raw) || /not allowed on the scope/i.test(raw)) {
    return t('pdfUtils.permissionDenied');
  }
  if (/no pdf header/i.test(raw) || /not a pdf/i.test(raw)) {
    return t('pdfUtils.thisFileIsNotA');
  }
  if (/password/i.test(raw) || /encrypted/i.test(raw)) {
    return t('pdfUtils.thisPdfIsPasswordProtected');
  }
  if (/failed to parse/i.test(raw) || /invalid pdf/i.test(raw)) {
    return t('pdfUtils.thisFileAppearsToBe');
  }

  return t('pdfUtils.failedToLoadPdfThe');
}

/**
 * Whether a failure is the filesystem refusing access rather than the file being
 * wrong. Tauri rejects a read outside the capability scope with "forbidden path".
 *
 * Worth its own predicate because the two need opposite responses: a damaged
 * file should be offered the repair tool, while a blocked one is intact and
 * repairing it would be nonsense. Getting this backwards is what told people
 * their documents were corrupt when they were not.
 */
export function isPermissionError(err: unknown): boolean {
  const raw = err instanceof Error ? err.message : String(err);
  return /forbidden path|not allowed on the scope/i.test(raw);
}

/**
 * Whether a raw error looks like a PDF load/parse failure (bad file) as opposed
 * to a processing failure (e.g. a Ghostscript compression error) — which already
 * carries its own actionable message and should not be relabeled as a corrupt file.
 */
export function isPdfLoadError(err: unknown): boolean {
  const raw = err instanceof Error ? err.message : String(err);
  return /no pdf header|not a pdf|password|encrypted|failed to parse|invalid pdf/i.test(raw);
}

/** Parse "2 MB", "500 KB", "1.5 GB" into bytes. No unit defaults to MB. Returns null on invalid input. */
export function parseSizeInput(input: string): number | null {
  const match = input.trim().match(/^(\d+(?:\.\d+)?)\s*(KB|MB|GB)?$/i);
  if (!match) return null;
  const value = parseFloat(match[1]);
  const unit = (match[2] ?? 'MB').toUpperCase();
  const multipliers: Record<string, number> = { KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3 };
  return Math.round(value * multipliers[unit]);
}

/** Parse page range string like "1-3, 5, 7-9" into sorted, 0-indexed page indices. */
export function parsePageRange(input: string, maxPages: number): number[] {
  const indices = new Set<number>();
  const parts = input.split(',').map((s) => s.trim()).filter(Boolean);
  for (const part of parts) {
    const rangeMatch = part.match(/^(\d+)-(\d+)$/);
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1], 10);
      const end = parseInt(rangeMatch[2], 10);
      for (let i = start; i <= end; i++) {
        if (i >= 1 && i <= maxPages) indices.add(i - 1); // convert to 0-indexed
      }
    } else {
      const page = parseInt(part, 10);
      if (!isNaN(page) && page >= 1 && page <= maxPages) indices.add(page - 1);
    }
  }
  return Array.from(indices).sort((a, b) => a - b);
}

/** Format bytes to human-readable string (KB/MB/GB). Returns empty string for 0. */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '';
  // toFixed() hardcodes "." as the decimal separator, which is wrong in both
  // German and Turkish — "2.50 MB" reads as two and a half thousand megabytes.
  // formatNumber goes through Intl bound to the *app* language: left to default,
  // Intl follows the operating system and would put a comma into an English UI.
  const fixed = (value: number, digits: number) =>
    formatNumber(value, { minimumFractionDigits: digits, maximumFractionDigits: digits });

  if (bytes < 1024 ** 2) return `${fixed(bytes / 1024, 1)} KB`;
  if (bytes < 1024 ** 3) return `${fixed(bytes / 1024 ** 2, 2)} MB`;
  return `${fixed(bytes / 1024 ** 3, 2)} GB`;
}
