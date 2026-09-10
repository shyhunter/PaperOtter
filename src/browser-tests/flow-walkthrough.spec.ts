/**
 * [FLOW] Every tool taken through its first real transition, on film and on the clock.
 *
 * Two things the invariant sweep cannot do, both asked for after the rule review.
 *
 * **Video.** Each test here records what the app actually did, so reviewing a
 * change means watching twenty short clips rather than repeating twenty
 * click-throughs by hand. That was the stated goal — to stop being the only
 * executor of the spec — and it is why video is `on` for this file rather than
 * `retain-on-failure`: a passing run is exactly the run worth watching.
 *
 * **Time.** Every transition is measured and written to `.e2e-results/`, so the
 * trend is visible run to run, and asserted against a deliberately loose ceiling
 * (see STEP_BUDGET_MS). The ceiling catches a freeze; the recorded numbers catch
 * the creep that no single run can show.
 *
 * The step bar is what makes this generic. Every flow reports its position
 * through `onStepChange`, which the shell renders as `data-active` on a step
 * cell — so "has this tool advanced?" is one question with one answer for all of
 * them, taken from the contract rather than from per-tool knowledge.
 */
import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { TOOL_REGISTRY, type ToolDefinition } from '@/types/tools';
import { HARNESS_PLATFORM } from './support/platform';
import {
  bootApp,
  openToolById,
  expectOnScreen,
  expectEveryControlReachable,
  expectWindowDoesNotScroll,
  fixtureBytes,
  HOME,
  type Seed,
} from './support/app';

test.use({ viewport: { width: 900, height: 660 }, video: 'on' });

/**
 * The ceiling a step transition must stay under.
 *
 * Deliberately far above anything observed — the slowest tool today is Compress
 * at ~950ms, and everything else is under 250ms. A tight budget on a shared CI
 * runner buys flakes, not information, and a flaky guard gets muted, which is
 * worse than no guard. This number is here to catch the class of regression that
 * makes the window beach-ball; the per-run timings written below are what show
 * the slow creep.
 */
const STEP_BUDGET_MS = 5_000;

/** Where the timings land, one file per tool so parallel workers cannot race. */
const TIMINGS_DIR = join(process.cwd(), '.e2e-results', 'step-timings');

/** The committed fixture a tool of each kind can actually open. */
const FIXTURE_FOR: Record<string, string> = {
  pdf: 'sample.pdf',
  image: 'sample.jpg',
  document: 'sample.docx',
};

/** How a tool's first step is completed, where the default does not fit. */
interface Entry {
  fixture?: string;
  /** Buttons to press in order, by visible name, for flows with no test id. */
  names?: string[];
}

const ENTRY: Record<string, Entry> = {
  // The two multi-file flows hand-roll a step one with no test ids on it: pick
  // the files, then confirm. Named rather than given ids because adding ids is a
  // source change, and this file is not the place to make one.
  'merge-pdf': { names: ['Select PDFs', 'Continue'] },
  'jpg-to-pdf': { names: ['Select Images', 'Continue'] },
};

/**
 * Edit PDF is absent for the reason recorded in tool-contract.spec.ts: it has no
 * step of its own to walk. Its behaviour is covered there by TOOL-03.
 */
const WALKABLE: ToolDefinition[] = Object.values(TOOL_REGISTRY).filter(
  (t) =>
    t.id !== 'edit-pdf' && (!t.requiresPlatform || t.requiresPlatform.includes(HARNESS_PLATFORM)),
);

/** The step the bar currently marks active, or null before any is marked. */
async function activeStep(page: Page): Promise<number | null> {
  const index = await page
    .locator('[data-testid="step-bar-item"][data-active="true"]')
    .getAttribute('data-step-index');
  return index === null ? null : Number(index);
}

function seedFor(tool: ToolDefinition): { seed: Seed; fixture: string } {
  const fixture = ENTRY[tool.id]?.fixture ?? FIXTURE_FOR[tool.acceptsFormats[0]];
  const path = `${HOME}/${fixture}`;
  return {
    fixture,
    seed: {
      files: { [path]: fixtureBytes(fixture) },
      // A multi-select dialog answers with an array; a single one with a string.
      openQueue: [tool.acceptsMultipleFiles ? [path, path] : path],
    },
  };
}

/**
 * Open the tool, complete its first step with a real document, and return how
 * long the app took to show the second one.
 */
async function driveToStepTwo(page: Page, tool: ToolDefinition): Promise<number> {
  const { seed, fixture } = seedFor(tool);
  await bootApp(page, seed);
  await openToolById(page, tool.id);

  expect(await activeStep(page), 'every tool starts on its first step').toBe(0);

  const started = Date.now();
  const names = ENTRY[tool.id]?.names;
  if (names) {
    for (const name of names) await page.getByRole('button', { name }).click();
  } else {
    await page.getByTestId('open-file-btn').click();
  }

  // Waiting on the bar rather than on a per-tool test id: the bar is the one
  // progress signal every flow already reports, so this asks the same question
  // of all of them.
  await expect(
    page.locator('[data-testid="step-bar-item"][data-active="true"][data-step-index="1"]'),
    `${tool.id} advanced to its second step after opening ${fixture}`,
  ).toBeVisible({ timeout: STEP_BUDGET_MS });

  return Date.now() - started;
}

for (const tool of WALKABLE) {
  test(`[FLOW-01] ${tool.id} takes a real document from step 1 to step 2`, async ({ page }) => {
    const elapsed = await driveToStepTwo(page, tool);

    mkdirSync(TIMINGS_DIR, { recursive: true });
    writeFileSync(
      join(TIMINGS_DIR, `${tool.id}.json`),
      `${JSON.stringify({ tool: tool.id, transition: 'step1->step2', ms: elapsed }, null, 2)}\n`,
    );
    expect(elapsed, `${tool.id} step 1 -> step 2 took ${elapsed}ms`).toBeLessThan(STEP_BUDGET_MS);

    // The contract does not stop at step one. What the sweep asserts about a
    // tool's first step has to hold on its second, with a real document loaded
    // — which is the state the reported defects were actually found in.
    const where = `${tool.id} step 2 at 900x660`;
    await expectWindowDoesNotScroll(page, where);
    await expectEveryControlReachable(page, where);
  });

  test(`[FLOW-02] ${tool.id} keeps a way back on screen at step 2`, async ({ page }) => {
    await driveToStepTwo(page, tool);

    // Located by the word on the button, not by a test id: only Compress and
    // Sign carry `back-btn`, while the other eighteen flows render a Back button
    // with no hook on it at all. Asserting the id would have declared eighteen
    // working flows broken. What the rule says is that a control the user reads
    // as "Back" is on screen, so that is what is asserted — the same reason L4
    // was dropped: assert the outcome, never the mechanism.
    //
    // `exact` matters: role-name matching is substring by default, so a plain
    // 'Back' also catches the breadcrumb's "Back to Dashboard" aria-label and
    // resolves to two controls.
    await expectOnScreen(
      page.getByRole('button', { name: 'Back', exact: true }),
      `${tool.id} step 2 at 900x660: Back`,
    );
  });
}
