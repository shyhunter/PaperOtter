import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * [SIGSTEP] The Signature step scrolls, and the Place step is never blank.
 *
 * Two reports from one screenshot pair. "We need to be able to scroll to reach
 * Use this signature, if there are many different signature it is than not
 * possible" -- the step's column had no overflow and no min-h-0, so the button
 * sat below the window with no way to reach it. And the saved grid was
 * uncapped, so ten stored signatures could take the screen on their own.
 *
 * The second is the guard in SignPdfFlow: `step === 2 && pdfBytes &&
 * signatureDataUrl && (...)`. Everything it turned away rendered nothing at
 * all, while the step bar sat on Place. A step that can render an empty window
 * is a bug whatever made the condition fail.
 *
 * Source scans because jsdom computes no layout, and because the branch that
 * renders nothing renders nothing to assert on.
 */

const CREATE_STEP = 'src/components/sign-pdf/SignatureCreateStep.tsx';
const FLOW = 'src/components/sign-pdf/SignPdfFlow.tsx';

/** The class lists in a file, so prose about the fix is never read as the bug. */
function classNames(file: string): string[] {
  return [...readFileSync(file, 'utf8').matchAll(/className="([^"]*)"/g)].map((m) => m[1]);
}

describe('the Signature step', () => {
  it('[SIGSTEP-01] its column may shrink, so the overflow engages', () => {
    // flex-1 with overflow and no min-h-0 is the bug this app has already had
    // once, in the Split page grid: a flex item will not shrink below its
    // content, so the container grows and nothing ever scrolls. See [UI-05].
    const scrolling = classNames(CREATE_STEP).filter((c) => c.includes('overflow-y-auto'));
    expect(scrolling.length, 'the step scrolls at all').toBeGreaterThan(0);

    const column = scrolling.find((c) => c.includes('flex-1'));
    expect(column, 'a scrolling flex column exists').toBeDefined();
    expect(column, 'and it is allowed to shrink').toContain('min-h-0');
  });

  it('[SIGSTEP-01b] Back is outside the scroll area, not carried off by it', () => {
    // Making the whole step scroll fixed Use This Signature sitting below the
    // window and put Back there instead: the bar was the last child of the
    // scrolling column, so it went with the content. Reported as the second
    // step having no Back button at all. The bar has to be a sibling of the
    // scrolling area, and flex-none, or it gives its height back to the content.
    const src = readFileSync(CREATE_STEP, 'utf8');
    const bar = src.slice(0, src.indexOf("data-testid=\"back-btn\""));
    const openedDivs = bar.split('<div').length - 1;
    const closedDivs = bar.split('</div>').length - 1;

    expect(openedDivs - closedDivs, 'Back sits one level in, beside the scroll area')
      .toBe(2);
    expect(bar.slice(bar.lastIndexOf('<div')), 'and does not give up its height')
      .toContain('flex-none');
  });

  it('[SIGSTEP-02] the saved list is capped rather than taking the screen', () => {
    // Ten is the stored maximum, which is four rows at three across.
    const grid = classNames(CREATE_STEP).find((c) => c.includes('grid-cols-2'));
    expect(grid, 'the saved grid').toBeDefined();
    expect(grid, 'bounded').toMatch(/max-h-/);
    expect(grid, 'and scrolls past the cap').toContain('overflow-y-auto');
  });
});

describe('the Place step', () => {
  it('[SIGSTEP-03] renders something even when its inputs are missing', () => {
    const src = readFileSync(FLOW, 'utf8');
    expect(src, 'a branch for the turned-away case')
      .toContain('step === 2 && !(pdfBytes && signatureDataUrl)');
    expect(src, 'that says so').toContain('signPdf.couldNotPlaceSignature');
  });

  it('[SIGSTEP-04] and offers a way out of it', () => {
    // A dead end is only marginally better than a blank one: the step bar's
    // own entries are not clickable backwards.
    const src = readFileSync(FLOW, 'utf8');
    const branch = src.slice(src.indexOf('step === 2 && !(pdfBytes'));
    expect(branch.slice(0, branch.indexOf('{step === 2 && pdfBytes')))
      .toMatch(/onClick=\{\(\) => goToStep\(1\)\}/);
  });
});
