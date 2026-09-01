/**
 * Browser tests — the third layer, with one job.
 *
 * A test belongs here **only if jsdom structurally cannot make the assertion**.
 * Everything else stays in vitest, which is faster and already covers it; three
 * layers on one project goes wrong by duplicating, not by missing things.
 *
 * What only a real browser can answer today:
 *   - pdf.js does not run under vitest at all. `MVP_BRIEF` §6 records it, the
 *     source of `pdfTextSearch` records it, and 28 test files stub around it.
 *     A search fix has already shipped broken because its fixtures were shaped
 *     the way pdf.js was *assumed* to emit text rather than how it does.
 *   - jsdom has no canvas backend, so no pixel any code produces can be checked.
 *   - jsdom computes no CSS, which is why three guards read source instead.
 *
 * This is NOT a Tauri test. Playwright drives browsers it manages; a Tauri
 * window is a native WKWebView/WebKitGTK/WebView2 with no attach path. Anything
 * touching Rust, real files or native dialogs belongs in the WebDriver suite.
 */
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './src/browser-tests',
  // Real pdf.js on a real document is slower than a stub, and worth it.
  timeout: 60_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [
    ['list'],
    // Alongside the WebDriver suite's results, for the same reason: a run
    // should leave something readable behind.
    ['json', { outputFile: '.e2e-results/playwright.json' }],
  ],
  use: {
    baseURL: 'http://localhost:5174',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // A port of its own, so a dev server someone already has running is neither
    // reused with unknown state nor killed out from under them.
    command: 'npx vite --port 5174 --strictPort',
    url: 'http://localhost:5174/src/browser-tests/harness.html',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
