import { createRequire } from 'node:module';
const pw = createRequire('/private/tmp/claude-501/-Users-erkanyilmaz-papercut/5ddcca8b-0fb3-44b5-99ec-d131e390f12e/scratchpad/package.json')('playwright');
const engine = process.env.BENCH_ENGINE || 'webkit';
const url = process.argv[2];

const browser = await pw[engine].launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('console', (m) => { const t = m.text(); if (!t.includes('[vite]')) console.log(`  ${t}`); });
page.on('pageerror', (e) => console.log(`  [pageerror] ${e.message}`));

const withTimeout = (p, ms, tag) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`__UNRESPONSIVE__ ${tag} >${ms}ms`)), ms))]);

async function probe(label) {
  try {
    const s = await withTimeout(page.evaluate(() =>
      ({ d: window.__BENCH.maxDrift, b: window.__BENCH.blocked, hb: window.__BENCH.events.length })), 10000, 'evaluate');
    console.log(`>> ${label}: maxDrift=${s.d}ms blocked=${JSON.stringify(s.b.slice(-8))} events=${s.hb}`);
    return true;
  } catch (e) { console.log(`>> ${label}: ${e.message}  <<< MAIN THREAD FROZEN`); return false; }
}

async function dumpButtons(tag) {
  try {
    const names = await withTimeout(page.evaluate(() =>
      [...document.querySelectorAll('button')].map(b => (b.textContent || '').trim().slice(0, 40)).filter(Boolean)), 10000, 'dump');
    console.log(`   buttons(${tag}) = ${JSON.stringify(names)}`);
  } catch (e) { console.log(`   buttons(${tag}) unavailable: ${e.message}`); }
}

async function step(label, fn) {
  console.log(`\n--- ${label} ---`);
  const t0 = Date.now();
  try { await fn(); console.log(`    ok ${Date.now() - t0}ms`); }
  catch (e) { console.log(`    FAILED ${Date.now() - t0}ms: ${String(e).split('\n')[0]}`); }
  return probe(label);
}

await page.goto(url, { waitUntil: 'domcontentloaded' });
await step('editor loads', async () => { await page.waitForSelector('canvas', { timeout: 90000 }); await page.waitForTimeout(4000); });
await dumpButtons('after load');
await step('open Rotate tool', async () => {
  await page.getByRole('button', { name: /rotate/i }).first().click({ timeout: 20000 });
  await page.waitForTimeout(3000);
});
await dumpButtons('rotate panel open');
// poll responsiveness for 60s without touching anything
for (let i = 0; i < 6; i++) {
  await new Promise(r => setTimeout(r, 10000));
  if (!await probe(`idle +${(i + 1) * 10}s`)) break;
}
await step('click Turn Right', async () => {
  await page.getByRole('button', { name: /turn right/i }).click({ timeout: 20000 });
  await page.waitForTimeout(5000);
});
for (let i = 0; i < 6; i++) {
  await new Promise(r => setTimeout(r, 10000));
  if (!await probe(`post-click +${(i + 1) * 10}s`)) break;
}
await browser.close();
