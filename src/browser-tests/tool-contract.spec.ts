/**
 * [TOOL] The invariants that hold for every tool, checked against every tool.
 *
 * The defect this answers is F4 on the diagnosis: there was no executable
 * definition of "a tool works". Twenty-two tools, four of them named in a
 * regression file, seventy-odd test ids and no stated obligation any of them had
 * to meet. So a rule agreed once — Back stays on screen, the window does not
 * scroll — held only where somebody remembered to re-check it by hand.
 *
 * Two ideas from the rule review shape this file:
 *
 *   - **The contract is data.** `TOOL_REGISTRY` already declares each tool's
 *     steps, and `ToolHeader` already renders the step bar from that
 *     declaration. So the assertion is not "Compress PDF has four steps" — it is
 *     "every tool shows the steps *it* declares", which needs no per-tool list
 *     and cannot drift.
 *   - **Assert the outcome, never the mechanism.** Nothing here looks at how a
 *     bar is built. It looks at whether a person can see and reach the control,
 *     which is the only claim that stays true across a legitimate rewrite.
 *
 * Scope is step one of each tool, deliberately: it is the step every tool has, it
 * needs no per-tool fixture, and it is where the platform gate, the header, the
 * step bar and the exit all first appear. Deeper steps need their own fixtures
 * and come next.
 */
import { test, expect, type Page } from '@playwright/test';
import { TOOL_REGISTRY, type ToolDefinition } from '@/types/tools';
import { en } from '@/i18n/en';
import type { Platform } from '@/lib/platform';
import { HARNESS_PLATFORM, userAgentFor } from './support/platform';
import {
  bootApp,
  withFile,
  openToolById,
  expectOnScreen,
  expectEveryControlReachable,
  expectWindowDoesNotScroll,
} from './support/app';

/**
 * The smallest window the app permits (`tauri.conf.json`: 900x660).
 *
 * The contract is the minimum, not the default. A user may drag the window to
 * this size, and everything that must be reachable must still be reachable here
 * — testing at Playwright's roomier 1280x720 hid the very regression the browser
 * layer was built to catch.
 */
test.use({ viewport: { width: 900, height: 660 } });

const ALL_TOOLS = Object.values(TOOL_REGISTRY);

/** What the registry says should be reachable on `platform`. */
function expectedOn(platform: Platform): string[] {
  return ALL_TOOLS.filter((t) => !t.requiresPlatform || t.requiresPlatform.includes(platform))
    .map((t) => t.id)
    .sort();
}

/** The tools the pinned harness platform offers — what the sweep below covers. */
const OFFERED: ToolDefinition[] = ALL_TOOLS.filter(
  (t) => !t.requiresPlatform || t.requiresPlatform.includes(HARNESS_PLATFORM),
);

/** The distinct tool ids the dashboard is currently showing. */
async function shownTools(page: Page): Promise<string[]> {
  const ids = await page.evaluate(() => [
    ...new Set(
      [...document.querySelectorAll('[data-tool-id]')].map((e) => e.getAttribute('data-tool-id')),
    ),
  ]);
  return ids.filter((id): id is string => id !== null).sort();
}

/** A step cell ends with its declared label, whatever marker precedes it. */
function endsWith(label: string): RegExp {
  return new RegExp(`${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
}

test('[TOOL-00] the dashboard offers exactly the tools the harness platform can run', async ({
  page,
}) => {
  await bootApp(page);

  // Both directions matter. A tool missing here is one nobody can reach; a tool
  // present that this platform cannot run is a card that fails when clicked —
  // the reason `requiresPlatform` hides rather than disables.
  expect(await shownTools(page), `tools offered on ${HARNESS_PLATFORM}`).toEqual(
    expectedOn(HARNESS_PLATFORM),
  );
});

/**
 * The platform gate itself, on all three platforms.
 *
 * `currentPlatform()` reads the user agent, so a browser context is the whole
 * apparatus needed to ask "what would a Windows user see?" — no Windows machine
 * required. That matters here specifically: OCR has a macOS-only engine, and the
 * rule is that it must be *hidden* off macOS rather than shown and broken. This
 * is the only place in the repo that can check the other side of that rule.
 */
for (const platform of ['macos', 'windows', 'linux'] as const) {
  test(`[TOOL-00b] a ${platform} user is offered the tools ${platform} can run`, async ({
    browser,
  }) => {
    const context = await browser.newContext({
      userAgent: userAgentFor(platform),
      viewport: { width: 900, height: 660 },
    });
    const page = await context.newPage();
    try {
      await bootApp(page);
      expect(await shownTools(page), `tools offered on ${platform}`).toEqual(expectedOn(platform));
    } finally {
      await context.close();
    }
  });
}

/**
 * Tools whose step one is not a step at all.
 *
 * `edit-pdf` is the only one, and it is not an oversight in the test: opening it
 * runs an interception in `AppContent` (App.tsx:959) that opens the file picker
 * straight away and then routes to the editor, so the flow the registry declares
 * for it never becomes visible. Its contract and its behaviour disagree, and
 * that disagreement is pinned down by TOOL-03 below rather than papered over by
 * a skip — a hole in a sweep is how the thing this suite exists to prevent gets
 * back in.
 */
const OPENS_STRAIGHT_INTO_A_PICKER = new Set(['edit-pdf']);

const SHOWS_A_FLOW = OFFERED.filter((t) => !OPENS_STRAIGHT_INTO_A_PICKER.has(t.id));

for (const tool of SHOWS_A_FLOW) {
  test(`[TOOL-01] ${tool.id} announces itself and its own declared steps`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await bootApp(page);
    await openToolById(page, tool.id);

    // The header names this tool and not the one before it — the check that
    // catches a flow left mounted or a registry entry pointing at a neighbour.
    await expect(page.getByTestId('current-tool')).toHaveText(en[tool.name]);

    // Matched on the label rather than the whole cell: each cell also carries a
    // position marker, which is a number now and a tick once the step is behind
    // the user. Asserting the label asserts the contract; asserting the marker
    // too would assert the rendering.
    const steps = page.getByTestId('step-bar-item');
    await expect(steps).toHaveCount(tool.steps.length);
    await expect(steps).toHaveText(tool.steps.map((s) => endsWith(en[s.label])));

    // Every tool starts on its first step. A bar marking any other step means
    // the bar and the flow disagree about where the user is.
    const active = await steps.evaluateAll((cells) =>
      cells.map((c) => c.getAttribute('data-active')),
    );
    expect(active.indexOf('true'), 'the active step is the first one').toBe(0);
    expect(active.filter((a) => a === 'true'), 'exactly one step is active').toHaveLength(1);

    expect(errors.filter((e) => e.includes('[tauri-mock]')), 'no unmocked Tauri call').toEqual([]);
    expect(errors, 'no uncaught error while opening the tool').toEqual([]);
  });

  test(`[TOOL-02] ${tool.id} is fully usable at the smallest allowed window`, async ({ page }) => {
    await bootApp(page);
    await openToolById(page, tool.id);

    const where = `${tool.id} step 1 at 900x660`;

    // Every tool must offer a way out. On step one that is the breadcrumb, not
    // `back-btn` — a contract demanding `back-btn` everywhere would be demanding
    // the wrong thing, which is why the rule is written as an outcome ("a way
    // out is on screen") rather than as a test id.
    await expectOnScreen(
      page.getByTestId('back-to-dashboard'),
      `${where}: the exit to the dashboard`,
    );

    await expectWindowDoesNotScroll(page, where);
    await expectEveryControlReachable(page, where);
  });
}

/**
 * [TOOL-03] What Edit PDF actually does, written down.
 *
 * Kept separate because it is the one tool that does not present a step of its
 * own, and because both halves of its behaviour are worth holding still: a file
 * chosen opens the editor, and a picker dismissed returns to the dashboard
 * rather than stranding the user on a blank flow. If Edit PDF is ever given a
 * real first step, this test fails and the tool joins the sweep above — which is
 * the outcome to want.
 */
test('[TOOL-03] edit-pdf opens the picker at once and lands in the editor', async ({ page }) => {
  await bootApp(page, withFile('sample.pdf'));
  await openToolById(page, 'edit-pdf', { showsAFlow: false });

  // The editor, not the three-step flow the registry declares for this tool.
  await expect(page.getByTestId('dashboard')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Revert' })).toBeVisible();
  await expect(page.getByTestId('step-bar-item'), 'the editor is not a stepped flow').toHaveCount(0);
});

test('[TOOL-03b] dismissing the Edit PDF picker returns to the dashboard', async ({ page }) => {
  // No file queued, so the mock picker answers as a cancelled dialog does.
  await bootApp(page);
  await page.locator('[data-tool-id="edit-pdf"]').first().click();

  // Nothing is stranded: the user is back where they started rather than on an
  // empty flow with no file. Asserted because it is easy to lose in a refactor
  // and impossible to notice from the outside.
  await expect(page.getByTestId('dashboard')).toBeVisible();
});
