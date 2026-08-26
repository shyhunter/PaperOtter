import type { RedactionRect } from '@/components/redact-pdf/RedactOverlay';
import type { TextMatch } from '@/lib/pdfTextSearch';
import { t } from '@/i18n';

/**
 * How much of a line a text match should cover.
 *
 * Both are wanted: redacting a name usually means the name, but sometimes the
 * whole line it sits on -- a salary next to a job title gives it away either way.
 * The search returns both boxes, so switching costs nothing.
 */
export type RedactionScope = 'match' | 'line';

export const REDACTION_SCOPES: { value: RedactionScope; label: string; hint: string }[] = [
  { value: 'match', label: t('redactionScope.justTheMatch'), hint: t('redactionScope.coversOnlyTheFoundText') },
  { value: 'line', label: t('redactionScope.wholeLine'), hint: t('redactionScope.coversTheWholeLineIt') },
];

/** Two rectangles are the same mark if they start within half a percent. */
function sameSpot(a: { pageIndex: number; x: number; y: number }, b: { pageIndex: number; x: number; y: number }) {
  return a.pageIndex === b.pageIndex && Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5;
}

export function matchToRect(match: TextMatch, scope: RedactionScope, id: string): RedactionRect {
  const box = scope === 'line' ? match.line : match;
  return {
    id,
    pageIndex: match.pageIndex,
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    source: 'search',
  };
}

/** Whether this match is already marked, so the same word is not stacked twice. */
export function isAlreadyMarked(
  match: TextMatch,
  scope: RedactionScope,
  existing: RedactionRect[],
): boolean {
  const box = scope === 'line' ? match.line : match;
  return existing.some((r) => r.source === 'search' && sameSpot({ ...box, pageIndex: match.pageIndex }, r));
}
