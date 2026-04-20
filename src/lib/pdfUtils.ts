// Shared utility functions extracted for testability.
// Used by ConfigureStep.tsx (and potentially CompareStep.tsx).

/**
 * Convert a raw PDF parsing/loading error into a short, user-friendly message.
 * The raw errors from pdf-lib (e.g. "Failed to parse PDF document (line:10443
 * col:114 offset=1693099): No PDF header found") are not actionable for users.
 */
export function friendlyPdfError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);

  if (/no pdf header/i.test(raw) || /not a pdf/i.test(raw)) {
    return 'This file is not a valid PDF document. Please select a valid PDF file.';
  }
  if (/password/i.test(raw) || /encrypted/i.test(raw)) {
    return 'This PDF is password-protected and could not be opened.';
  }
  if (/failed to parse/i.test(raw) || /invalid pdf/i.test(raw)) {
    return 'This file appears to be corrupted or is not a valid PDF. Please try a different file.';
  }

  return 'Failed to load PDF. The file may be corrupted or not a valid PDF document.';
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
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}
