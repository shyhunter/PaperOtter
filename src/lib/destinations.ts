// Destination presets — answering "will the portal accept this?"
//
// Every other tool in this app answers "what can I do to this document?". The
// persona has a different question: an upload form told them PDF, under 2 MB,
// A4, and they want to know whether what they are holding will be taken. That
// question is answered at the *end* of the flow, against the result, not at the
// start against the controls — so a destination is a set of requirements that
// gets checked, not just a bundle of settings that gets applied.
//
// The built-ins are deliberately generic. A preset named for a consulate or a
// university is a factual claim about someone else's bureaucracy: those limits
// vary by office, change without notice, and being confidently wrong gets an
// application rejected and blamed on the app. Users name their own — they are
// the ones who read the form.
import type { PdfPagePreset } from '@/types/file';
import { formatBytes } from '@/lib/pdfUtils';
import { offersKbUnit, type SizeUnit } from '@/lib/compressTargetSize';
import { t } from '@/i18n';

export interface DestinationRequirement {
  /** Stable — a saved choice refers to it. */
  id: string;
  /**
   * The name to show. Built-ins carry `nameKey` instead, since their names are
   * interface copy and have to translate; a user's own name is their words and
   * is stored verbatim in whatever language they typed it.
   */
  name?: string;
  nameKey?: string;
  /** Upper bound on the finished file. */
  maxBytes?: number;
  /** Required page size. Orientation is not part of it. */
  pageSize?: Exclude<PdfPagePreset, 'custom'>;
  maxPages?: number;
  /** Absent on built-ins; set on anything the user saved themselves. */
  userDefined?: boolean;
}

export type ConstraintKind = 'size' | 'pageSize' | 'pageCount';

/**
 * `unknown` is a real answer and not a synonym for failure. A result that never
 * resized carries no page dimensions, and claiming the page size is right
 * because we did not look is the one verdict that could get someone rejected
 * while telling them they were fine.
 */
export type CheckStatus = 'met' | 'unmet' | 'unknown';

export interface ConstraintResult {
  kind: ConstraintKind;
  /** What was asked for, e.g. "Under 2 MB". */
  label: string;
  /** What was produced, e.g. "1.4 MB". */
  actual: string;
  status: CheckStatus;
}

export interface ConformanceVerdict {
  /** True only when every stated constraint was checked and met. */
  meets: boolean;
  constraints: ConstraintResult[];
}

/** The parts of a processing result a destination can be checked against. */
export interface CheckableResult {
  outputSizeBytes: number;
  pageCount: number;
  outputPageDimensions: { widthPt: number; heightPt: number } | null;
}

const MB = 1024 * 1024;

/** Page sizes in PDF points, as pdf-lib's `PageSizes` defines them. */
const PAGE_POINTS: Record<Exclude<PdfPagePreset, 'custom'>, [number, number]> = {
  A4: [595.28, 841.89],
  A3: [841.89, 1190.55],
  Letter: [612, 792],
};

/**
 * Half a point. Ghostscript and pdf-lib do not round-trip a page to the
 * micrometre, and a fraction of a point is the same A4 to every portal on
 * earth — an exact comparison would make the check useless on real output.
 */
const PAGE_TOLERANCE_PT = 1;

function matchesPageSize(
  dims: { widthPt: number; heightPt: number },
  preset: Exclude<PdfPagePreset, 'custom'>,
): boolean {
  const [w, h] = PAGE_POINTS[preset];
  // Compared as an unordered pair: a page is A4 whether it is portrait or
  // landscape, and comparing width to width would fail a rotated one.
  const got = [dims.widthPt, dims.heightPt].sort((a, b) => a - b);
  const want = [w, h].sort((a, b) => a - b);
  return (
    Math.abs(got[0] - want[0]) <= PAGE_TOLERANCE_PT &&
    Math.abs(got[1] - want[1]) <= PAGE_TOLERANCE_PT
  );
}

/** Describe a page as its preset name when it is one, else its size in mm. */
function describePage(dims: { widthPt: number; heightPt: number }): string {
  for (const preset of Object.keys(PAGE_POINTS) as Array<Exclude<PdfPagePreset, 'custom'>>) {
    if (matchesPageSize(dims, preset)) return preset;
  }
  const mm = (pt: number) => Math.round((pt / 72) * 25.4);
  return `${mm(dims.widthPt)} × ${mm(dims.heightPt)} mm`;
}

/**
 * Check a finished result against what a destination asks for.
 *
 * Only the constraints the destination actually states are reported: a
 * destination with no page limit must not comment on page count, or the verdict
 * reads as though it checked more than it did.
 */
export function checkDestination(
  requirement: DestinationRequirement,
  result: CheckableResult,
): ConformanceVerdict {
  const constraints: ConstraintResult[] = [];

  if (requirement.maxBytes !== undefined) {
    constraints.push({
      kind: 'size',
      label: t('destination.underSize', { size: formatBytes(requirement.maxBytes) }),
      actual: formatBytes(result.outputSizeBytes),
      status: result.outputSizeBytes <= requirement.maxBytes ? 'met' : 'unmet',
    });
  }

  if (requirement.pageSize !== undefined) {
    const dims = result.outputPageDimensions;
    constraints.push({
      kind: 'pageSize',
      label: requirement.pageSize,
      actual: dims ? describePage(dims) : t('destination.notChecked'),
      status: dims === null ? 'unknown' : matchesPageSize(dims, requirement.pageSize) ? 'met' : 'unmet',
    });
  }

  if (requirement.maxPages !== undefined) {
    constraints.push({
      kind: 'pageCount',
      label: t('destination.maxPages', { count: requirement.maxPages }),
      actual: String(result.pageCount),
      status: result.pageCount <= requirement.maxPages ? 'met' : 'unmet',
    });
  }

  return {
    // A destination that states nothing has verified nothing, so it cannot
    // report a pass — and one unknown constraint is enough to withhold it.
    meets: constraints.length > 0 && constraints.every((c) => c.status === 'met'),
    constraints,
  };
}

/**
 * The ones we can state as fact.
 *
 * Mail servers publish their attachment limits and they are stable; "under
 * 2 MB, A4" is the shape almost every government upload form takes and claims
 * nothing about which one. Anything more specific belongs to the user.
 */
export const BUILT_IN_DESTINATIONS: DestinationRequirement[] = [
  { id: 'upload-2mb-a4', nameKey: 'destination.webUpload2mbA4', maxBytes: 2 * MB, pageSize: 'A4' },
  { id: 'email-10mb', nameKey: 'destination.email10mb', maxBytes: 10 * MB },
  { id: 'email-25mb', nameKey: 'destination.email25mb', maxBytes: 25 * MB },
];

/** What to show for a destination, built-in or the user's own. */
export function destinationName(d: DestinationRequirement): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return d.nameKey ? t(d.nameKey as any) : (d.name ?? '');
}

/**
 * A destination's size limit, as the target-size input expects to hold it.
 *
 * The unit follows the same rule the manual control uses: once a limit reaches a
 * megabyte, every reachable KB value is a five-digit number nobody would read.
 * Rounded *down*, which is the opposite of `smallestReachableTarget` and for the
 * opposite reason — this is a ceiling, and rounding 2.5 MB up to 3 would ask for
 * more than the portal allows.
 */
export function targetSizeInput(maxBytes: number): { value: string; unit: SizeUnit } {
  const unit: SizeUnit = offersKbUnit(maxBytes) ? 'KB' : 'MB';
  const divisor = unit === 'MB' ? 1024 * 1024 : 1024;
  return { value: String(Math.max(1, Math.floor(maxBytes / divisor))), unit };
}
