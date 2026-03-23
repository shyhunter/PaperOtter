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

/** Check whether an element with the given data-testid is visible. */
export async function testIdDisplayed(browser: Browser, testId: string): Promise<boolean> {
  return browser.execute((id: string) => {
    const el = document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
    if (!el) return false;
    const style = getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && el.offsetParent !== null;
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
export async function waitForTestId(
  browser: Browser,
  testId: string,
  opts: { timeout?: number; timeoutMsg?: string } = {},
): Promise<void> {
  await browser.waitUntil(
    () => testIdExists(browser, testId),
    {
      timeout: opts.timeout ?? 15000,
      interval: 200,
      timeoutMsg: opts.timeoutMsg ?? `Timed out waiting for [data-testid="${testId}"]`,
    },
  );
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
      const opt = Array.from(sel.options).find((o) => o.textContent?.trim() === t);
      if (!opt) throw new Error(`Option "${t}" not found in [data-testid="${id}"]`);
      sel.value = opt.value;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    },
    testId,
    text,
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
