import { createRequire } from 'node:module';
const pw = createRequire('/private/tmp/claude-501/-Users-erkanyilmaz-papercut/5ddcca8b-0fb3-44b5-99ec-d131e390f12e/scratchpad/package.json')('playwright');
const browser = await pw[process.env.BENCH_ENGINE || 'webkit'].launch();
const page = await browser.newPage();
page.on('console', (m) => console.log(`  ${m.text()}`));
page.on('pageerror', (e) => console.log(`  [pageerror] ${e.message}`));
const to = (p, ms, tag) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error(`UNRESPONSIVE ${tag}`)), ms))]);
await page.goto(process.argv[2], { waitUntil: 'domcontentloaded' });
await page.waitForSelector('button');
console.log('mounted ok, clicking…');
const t0 = Date.now();
try { await page.click('button', { timeout: 15000 }); console.log(`click returned ${Date.now() - t0}ms`); }
catch (e) { console.log(`click FAILED ${Date.now() - t0}ms: ${String(e).split('\n')[0]}`); }
for (let i = 0; i < 4; i++) {
  await new Promise(r => setTimeout(r, 5000));
  try { const s = await to(page.evaluate(() => window.__BENCH.maxDrift), 8000, 'evaluate');
        console.log(`  +${(i+1)*5}s responsive, maxDrift=${s}ms`); }
  catch (e) { console.log(`  +${(i+1)*5}s ${e.message}  <<< FROZEN`); }
}
await browser.close();
