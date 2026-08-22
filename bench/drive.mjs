import { createRequire } from 'node:module';
const pw = createRequire('/private/tmp/claude-501/-Users-erkanyilmaz-papercut/5ddcca8b-0fb3-44b5-99ec-d131e390f12e/scratchpad/package.json')('playwright');

const url = process.argv[2];
const engine = process.env.BENCH_ENGINE || 'chromium';
const chromium = pw[engine];
const timeoutMs = Number(process.argv[3] ?? 180000);

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('console', (m) => console.log(`  [console.${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => console.log(`  [pageerror] ${e.message}`));
await page.goto(url, { waitUntil: 'domcontentloaded' });

const t0 = Date.now();
let done = false;
while (Date.now() - t0 < timeoutMs) {
  try {
    done = await page.evaluate(() => window.__BENCH?.done === true);
  } catch { /* page busy */ }
  if (done) break;
  await new Promise((r) => setTimeout(r, 1000));
}
const state = await page.evaluate(() => ({
  maxDrift: window.__BENCH?.maxDrift, n: window.__BENCH?.events?.length,
})).catch(() => ({ maxDrift: 'unreadable (page blocked)', n: '?' }));
console.log(`\n=== ${done ? 'COMPLETED' : 'TIMED OUT after ' + timeoutMs + 'ms'} ===`);
console.log(`maxDrift=${state.maxDrift}ms events=${state.n}`);
await browser.close();
process.exit(done ? 0 : 2);
