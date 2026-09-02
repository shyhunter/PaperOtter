/**
 * Helpers for interacting with elements via data-testid in tauri-wd.
 *
 * tauri-wd (WebKitGTK WebDriver) does not expose custom `data-*` attributes
 * through standard CSS-selector queries.  These helpers use `browser.execute()`
 * to query / interact with elements directly in the page context.
 */
import type { Browser } from 'webdriverio';

// ─── Primitive helpers ──────────────────────────────────────────────────────

/** Check whether an element with the given data-testid exists in the DOM. */
export async function testIdExists(browser: Browser, testId: string): Promise<boolean> {
  return browser.execute(
    (id: string) => !!document.querySelector(`[data-testid="${id}"]`),
    testId,
  );
}

/**
 * Whether an element with the given data-testid is visible to a person.
 *
 * Measured, not inferred from `offsetParent`. `offsetParent` is null for any
 * `position: fixed` element by definition — which is every modal, dialog, toast
 * and popover in this app. The blocking "file is too large" modal covers the
 * whole window, and this helper called it invisible: the test that exists to
 * prove users are warned about a 110 MB file failed while the warning was on
 * screen the entire time.
 */
export async function testIdDisplayed(browser: Browser, testId: string): Promise<boolean> {
  return browser.execute((id: string) => {
    const el = document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
    if (!el) return false;
    const style = getComputedStyle(el);
    // Deliberately not opacity. Half this app fades in with
    // `animate-fade-slide-in`, whose first frame is opacity 0, so treating that
    // as hidden makes every check a race against an animation — lost four
    // image tests on a loaded machine while the screen they asked about was
    // plainly there. Display, visibility and a real measured box are the
    // questions that have stable answers.
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }, testId);
}

/** Click the first element matching the data-testid. */
export async function clickTestId(browser: Browser, testId: string): Promise<void> {
  await browser.execute((id: string) => {
    const el = document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
    if (el) el.click();
    else throw new Error(`[data-testid="${id}"] not found`);
  }, testId);
}

/** Return the textContent of the first element matching the data-testid. */
export async function getTestIdText(browser: Browser, testId: string): Promise<string> {
  return browser.execute((id: string) => {
    const el = document.querySelector(`[data-testid="${id}"]`);
    return el?.textContent ?? '';
  }, testId);
}

/** Get an attribute value on the first matching data-testid element. */
export async function getTestIdAttr(browser: Browser, testId: string, attr: string): Promise<string | null> {
  return browser.execute(
    (id: string, a: string) => {
      const el = document.querySelector(`[data-testid="${id}"]`);
      return el?.getAttribute(a) ?? null;
    },
    testId,
    attr,
  );
}

// ─── Wait helpers ───────────────────────────────────────────────────────────

/** Wait until an element with the given data-testid exists in the DOM. */
/**
 * What is on screen right now, for a failure message.
 *
 * Never throws: this runs while a test is already failing, and a diagnostic
 * that fails would replace the real error with its own.
 */
async function visibleTestIds(browser: Browser): Promise<string> {
  try {
    const ids = await browser.execute(() =>
      Array.from(document.querySelectorAll('[data-testid]'))
        .map((el) => el.getAttribute('data-testid') ?? ''),
    );
    const unique = [...new Set(ids)].filter(Boolean).sort();
    return unique.length > 0 ? unique.join(', ') : '(nothing with a data-testid)';
  } catch {
    return '(could not read the page)';
  }
}

export async function waitForTestId(
  browser: Browser,
  testId: string,
  opts: { timeout?: number; timeoutMsg?: string } = {},
): Promise<void> {
  try {
    await browser.waitUntil(
      () => testIdExists(browser, testId),
      {
        timeout: opts.timeout ?? 15000,
        interval: 200,
        timeoutMsg: opts.timeoutMsg ?? `Timed out waiting for [data-testid="${testId}"]`,
      },
    );
  } catch (err) {
    // Say what WAS there. "Timed out waiting for configure-step" names the
    // element that is missing and nothing about the screen that is present, so
    // every such failure costs a round trip to fetch a DOM snapshot before
    // anyone can even guess. On a slow machine the difference between "still
    // loading" and "went somewhere else entirely" is the whole diagnosis.
    const seen = await visibleTestIds(browser);
    throw new Error(`${(err as Error).message}\n  On screen instead: ${seen}`);
  }
}

/** Wait until an element with the given data-testid is visible. */
export async function waitForTestIdDisplayed(
  browser: Browser,
  testId: string,
  opts: { timeout?: number; timeoutMsg?: string } = {},
): Promise<void> {
  await browser.waitUntil(
    () => testIdDisplayed(browser, testId),
    {
      timeout: opts.timeout ?? 15000,
      interval: 200,
      timeoutMsg: opts.timeoutMsg ?? `Timed out waiting for [data-testid="${testId}"] to be displayed`,
    },
  );
}

// ─── Input helpers ──────────────────────────────────────────────────────────

/** Set the value of an <input> / <textarea> found by data-testid, dispatching change events. */
export async function setTestIdValue(browser: Browser, testId: string, value: string): Promise<void> {
  await browser.execute(
    (id: string, v: string) => {
      const el = document.querySelector(`[data-testid="${id}"]`) as HTMLInputElement | null;
      if (!el) throw new Error(`[data-testid="${id}"] not found`);
      // Use the native setter to trigger React's synthetic change event
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      if (nativeInputValueSetter) nativeInputValueSetter.call(el, v);
      else el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    },
    testId,
    value,
  );
}

/** Clear and set the value of an input found by data-testid. */
export async function clearAndSetTestIdValue(browser: Browser, testId: string, value: string): Promise<void> {
  await setTestIdValue(browser, testId, '');
  await setTestIdValue(browser, testId, value);
}

/** Select an <option> by visible text inside a <select> found by data-testid. */
export async function selectTestIdByText(browser: Browser, testId: string, text: string): Promise<void> {
  await browser.execute(
    (id: string, t: string) => {
      const sel = document.querySelector(`[data-testid="${id}"]`) as HTMLSelectElement | null;
      if (!sel) throw new Error(`[data-testid="${id}"] not found`);
      const options = Array.from(sel.options);
      // Exact first, then a prefix. Labels carry their detail — "A3" renders as
      // "A3 (297 × 420 mm)" and "Custom" as "Custom…" — and matching only
      // exactly turned a copy change into three failing tests, each reported as
      // a 120-second timeout because WebdriverIO retried the throw until Mocha
      // gave up. Listing the real options makes the next one self-diagnosing.
      const opt = options.find((o) => o.textContent?.trim() === t)
        ?? options.find((o) => o.textContent?.trim().startsWith(t));
      if (!opt) {
        throw new Error(
          `Option "${t}" not found in [data-testid="${id}"]. Options: ` +
          options.map((o) => `"${o.textContent?.trim()}" (value=${o.value})`).join(', '),
        );
      }
      sel.value = opt.value;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    },
    testId,
    text,
  );
}

/**
 * Pick a <select> option by its `value`.
 *
 * Prefer this over the label wherever a stable value exists. Values are
 * identifiers the code chose ("A3", "custom"); labels are user-facing copy in
 * nine languages, and a spec pinned to one of them breaks when somebody
 * improves the wording.
 */
export async function selectTestIdByValue(browser: Browser, testId: string, value: string): Promise<void> {
  await browser.execute(
    (id: string, v: string) => {
      const sel = document.querySelector(`[data-testid="${id}"]`) as HTMLSelectElement | null;
      if (!sel) throw new Error(`[data-testid="${id}"] not found`);
      const opt = Array.from(sel.options).find((o) => o.value === v);
      if (!opt) {
        throw new Error(
          `No option with value "${v}" in [data-testid="${id}"]. Values: ` +
          Array.from(sel.options).map((o) => o.value).join(', '),
        );
      }
      sel.value = v;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    },
    testId,
    value,
  );
}

// ─── Slider helper ──────────────────────────────────────────────────────────

/** Set a range-slider's value by data-testid, dispatching both change and mouseup. */
export async function setSliderValue(browser: Browser, testId: string, value: number): Promise<void> {
  await browser.execute(
    (id: string, v: number) => {
      const el = document.querySelector(`[data-testid="${id}"]`) as HTMLInputElement | null;
      if (!el) throw new Error(`[data-testid="${id}"] not found`);
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      if (nativeInputValueSetter) nativeInputValueSetter.call(el, String(v));
      else el.value = String(v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('mouseup', { bubbles: true }));
    },
    testId,
    value,
  );
}

// ─── Step-bar helper ────────────────────────────────────────────────────────

/**
 * Wait for the step bar to reach the given step index.
 *
 * Because data-testid and custom data-* attributes are only accessible via
 * `browser.execute`, we query the DOM directly.
 */
export async function waitForStep(browser: Browser, stepIndex: number): Promise<void> {
  await browser.waitUntil(
    async () =>
      browser.execute((idx: number) => {
        const items = document.querySelectorAll('[data-testid="step-bar-item"]');
        for (const item of items) {
          if (
            item.getAttribute('data-active') === 'true' &&
            item.getAttribute('data-step-index') === String(idx)
          )
            return true;
        }
        return false;
      }, stepIndex),
    { timeout: 15000, interval: 200, timeoutMsg: `Timed out waiting for step ${stepIndex}` },
  );
}

// ─── Text helpers ───────────────────────────────────────────────────────────

/**
 * Whether the page currently shows the given text.
 *
 * Used where the assertion really is "the user was told", and where marking up
 * every component that could say it would mean a testid in eleven flows for one
 * sentence. The message is the user-visible thing; asserting on it directly is
 * closer to the claim than asserting on a container that holds it.
 */
export async function pageContainsText(browser: Browser, needle: RegExp | string): Promise<boolean> {
  const source = typeof needle === 'string' ? needle : needle.source;
  const flags = typeof needle === 'string' ? 'i' : needle.flags;
  return browser.execute(
    (s: string, f: string) => new RegExp(s, f).test(document.body.innerText ?? ''),
    source,
    flags,
  );
}

/** Wait until the page shows the given text. */
export async function waitForText(
  browser: Browser,
  needle: RegExp | string,
  opts: { timeout?: number } = {},
): Promise<void> {
  await browser.waitUntil(() => pageContainsText(browser, needle), {
    timeout: opts.timeout ?? 15000,
    interval: 200,
    timeoutMsg: `Timed out waiting for text matching ${needle}`,
  });
}
