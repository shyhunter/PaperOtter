import { describe, it, expect } from 'vitest';
import {
  BUILT_IN_DESTINATIONS,
  checkDestination,
  destinationName,
  targetSizeInput,
  type DestinationRequirement,
} from '@/lib/destinations';

/**
 * [DEST] Destination presets — the "will the portal accept this?" check.
 *
 * The persona's question is not "what can I do to this PDF" but whether the
 * upload form will take it. A preset that only pre-fills the controls answers
 * the first question and leaves the second one where it was: unanswered, at the
 * moment the user is about to close the app and go back to the portal.
 *
 * So the requirement is checked against the *result*, from numbers the pipeline
 * already computes, and the verdict is stated per constraint rather than as a
 * single pass/fail — "1.4 MB ✓, A4 ✓, 4 pages ✓" tells someone what to fix.
 */

const A4 = { widthPt: 595.28, heightPt: 841.89 };
const LETTER = { widthPt: 612, heightPt: 792 };
const MB = 1024 * 1024;

const UNDER_2MB_A4: DestinationRequirement = {
  id: 'test', name: 'Under 2 MB, A4', maxBytes: 2 * MB, pageSize: 'A4',
};

describe('checkDestination', () => {
  it('[DEST-01] passes when every constraint is met', () => {
    const v = checkDestination(UNDER_2MB_A4, {
      outputSizeBytes: 1.4 * MB, pageCount: 4, outputPageDimensions: A4,
    });
    expect(v.meets).toBe(true);
    expect(v.constraints.every((c) => c.status === 'met')).toBe(true);
  });

  it('[DEST-02] fails on size, and says which constraint failed', () => {
    // The whole point of reporting per constraint: "it failed" sends someone
    // back to guess, "it is 2.4 MB and the limit is 2 MB" does not.
    const v = checkDestination(UNDER_2MB_A4, {
      outputSizeBytes: 2.4 * MB, pageCount: 4, outputPageDimensions: A4,
    });
    expect(v.meets).toBe(false);
    const size = v.constraints.find((c) => c.kind === 'size');
    expect(size?.status).toBe('unmet');
    expect(v.constraints.find((c) => c.kind === 'pageSize')?.status).toBe('met');
  });

  it('[DEST-03] fails on page size, orientation-independently', () => {
    // A page is A4 whether it is portrait or landscape. Comparing the raw
    // width and height would call a landscape A4 a failure.
    const portrait = checkDestination(UNDER_2MB_A4, {
      outputSizeBytes: MB, pageCount: 1, outputPageDimensions: A4,
    });
    const landscape = checkDestination(UNDER_2MB_A4, {
      outputSizeBytes: MB, pageCount: 1,
      outputPageDimensions: { widthPt: A4.heightPt, heightPt: A4.widthPt },
    });
    expect(portrait.constraints.find((c) => c.kind === 'pageSize')?.status).toBe('met');
    expect(landscape.constraints.find((c) => c.kind === 'pageSize')?.status).toBe('met');

    const letter = checkDestination(UNDER_2MB_A4, {
      outputSizeBytes: MB, pageCount: 1, outputPageDimensions: LETTER,
    });
    expect(letter.constraints.find((c) => c.kind === 'pageSize')?.status).toBe('unmet');
    expect(letter.meets).toBe(false);
  });

  it('[DEST-04] tolerates the rounding a real pipeline introduces', () => {
    // Ghostscript and pdf-lib do not round-trip a page to the micrometre. A
    // fraction of a point out is the same A4 to every portal on earth, and
    // failing it would make the check useless on real output.
    const v = checkDestination(UNDER_2MB_A4, {
      outputSizeBytes: MB, pageCount: 1,
      outputPageDimensions: { widthPt: 595.5, heightPt: 842.2 },
    });
    expect(v.constraints.find((c) => c.kind === 'pageSize')?.status).toBe('met');
  });

  it('[DEST-05] reports what it cannot know as unknown, never as met', () => {
    // outputPageDimensions is null for a result that never resized. Claiming
    // the page size is right because we did not look is the one answer that
    // would get someone rejected while telling them they were fine.
    const v = checkDestination(UNDER_2MB_A4, {
      outputSizeBytes: MB, pageCount: 1, outputPageDimensions: null,
    });
    expect(v.constraints.find((c) => c.kind === 'pageSize')?.status).toBe('unknown');
    expect(v.meets, 'an unknown constraint cannot be reported as a pass').toBe(false);
  });

  it('[DEST-06] only reports the constraints the destination actually states', () => {
    const sizeOnly: DestinationRequirement = { id: 'e', name: 'Email', maxBytes: 10 * MB };
    const v = checkDestination(sizeOnly, {
      outputSizeBytes: MB, pageCount: 400, outputPageDimensions: LETTER,
    });
    expect(v.constraints.map((c) => c.kind)).toEqual(['size']);
    expect(v.meets, '400 pages is irrelevant to a destination with no page limit').toBe(true);
  });

  it('[DEST-07] enforces a page count limit when one is stated', () => {
    const capped: DestinationRequirement = { id: 'c', name: 'Max 5 pages', maxPages: 5 };
    expect(checkDestination(capped, {
      outputSizeBytes: MB, pageCount: 5, outputPageDimensions: null,
    }).meets).toBe(true);
    expect(checkDestination(capped, {
      outputSizeBytes: MB, pageCount: 6, outputPageDimensions: null,
    }).meets).toBe(false);
  });

  it('[DEST-08] a destination that states nothing cannot pretend to verify anything', () => {
    const empty: DestinationRequirement = { id: 'x', name: 'Nothing' };
    const v = checkDestination(empty, {
      outputSizeBytes: MB, pageCount: 1, outputPageDimensions: A4,
    });
    expect(v.constraints).toEqual([]);
    expect(v.meets, 'no constraints means nothing was checked, not that it passed').toBe(false);
  });
});

describe('the built-in destinations', () => {
  it('[DEST-09] there are none, because every one of them would be a guess', () => {
    // Ships empty by decision, 2026-09-01. The first version carried three
    // "safe" generic ones -- an email limit, "under 2 MB, A4" -- and that was
    // inconsistent with the reason institutional presets were refused. Naming a
    // consulate claims to know its rules; naming a web upload limit claims to
    // know which portal this user is fighting. Both are the app guessing at a
    // use case it cannot see.
    //
    // Everyone's requirement comes from a form only they have read, so they
    // save their own and name it themselves.
    expect(BUILT_IN_DESTINATIONS).toEqual([]);
  });

  it('[DEST-09a] and if one is ever added, it may not name an institution', () => {
    // Kept as a live guard rather than deleted with the list: the reasoning
    // above is what has to survive, not the empty array.
    const institutional = /visa|consulate|embassy|schengen|ucas|passport|university|gov|tax|hmrc|irs/i;
    for (const d of BUILT_IN_DESTINATIONS) {
      const name = destinationName(d);
      expect(name, 'a built-in must render a name, not an empty string').not.toBe('');
      expect(institutional.test(name), `"${name}" claims to know an institution's rules`).toBe(false);
      const stated = [d.maxBytes, d.pageSize, d.maxPages].filter((v) => v !== undefined);
      expect(stated.length, `"${name}" checks nothing`).toBeGreaterThan(0);
    }
  });
});

describe('targetSizeInput', () => {
  it('[DEST-12] rounds a limit down, because it is a ceiling', () => {
    // The opposite of smallestReachableTarget, which rounds up. Asking for 3 MB
    // when the portal allows 2.5 would request more than it will take.
    expect(targetSizeInput(2.5 * 1024 * 1024)).toEqual({ value: '2', unit: 'MB' });
    expect(targetSizeInput(2 * 1024 * 1024)).toEqual({ value: '2', unit: 'MB' });
  });

  it('[DEST-13] uses KB only below a megabyte, as the manual control does', () => {
    expect(targetSizeInput(500 * 1024).unit).toBe('KB');
    expect(targetSizeInput(10 * 1024 * 1024).unit).toBe('MB');
  });

  it('[DEST-14] never produces a zero target', () => {
    expect(targetSizeInput(10).value).toBe('1');
  });
});

describe('how a requirement reads', () => {
  it('[DEST-15] a limit reads as a round number, not a measurement', () => {
    // Reported from a real build: the row read "Under 2.00 MB". formatBytes is
    // right for a *measured* size, where the two decimals carry information —
    // "8.26 MB" is a fact about a file. A limit is a round number somebody wrote
    // on a form, and rendering it to two decimals makes the app look like it is
    // guessing at a threshold it was given exactly.
    const v = checkDestination(
      { id: 'd', name: 'x', maxBytes: 2 * 1024 * 1024 },
      { outputSizeBytes: 8.26 * 1024 * 1024, pageCount: 432, outputPageDimensions: null },
    );
    expect(v.constraints[0].label).toBe('Under 2 MB');
    // The measured side keeps its precision — that half is not a threshold.
    expect(v.constraints[0].actual).toBe('8.26 MB');
  });

  it('[DEST-16] a fractional limit keeps the digits it needs', () => {
    const v = checkDestination(
      { id: 'd', name: 'x', maxBytes: 2.5 * 1024 * 1024 },
      { outputSizeBytes: 1024, pageCount: 1, outputPageDimensions: null },
    );
    expect(v.constraints[0].label).toBe('Under 2.5 MB');
  });

  it('[DEST-17] a constraint that was met does not repeat itself', () => {
    // Reported from the same run: the page row rendered "A4" twice, once as the
    // requirement and once as the measurement. When they are the same string the
    // repetition carries nothing, and the tick already says it matched.
    const v = checkDestination(
      { id: 'd', name: 'x', pageSize: 'A4' },
      { outputSizeBytes: 1024, pageCount: 1, outputPageDimensions: { widthPt: 595.28, heightPt: 841.89 } },
    );
    const page = v.constraints.find((c) => c.kind === 'pageSize');
    expect(page?.status).toBe('met');
    expect(page?.actual, 'an actual identical to the label is not worth showing').toBe('');
  });

  it('[DEST-18] a page size that did NOT match still says what it got', () => {
    // The suppression above must not hide the one case where the value matters.
    const v = checkDestination(
      { id: 'd', name: 'x', pageSize: 'A4' },
      { outputSizeBytes: 1024, pageCount: 1, outputPageDimensions: { widthPt: 612, heightPt: 792 } },
    );
    const page = v.constraints.find((c) => c.kind === 'pageSize');
    expect(page?.actual).toBe('Letter');
  });
});
