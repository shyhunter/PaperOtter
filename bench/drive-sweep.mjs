// Sweeps every tool panel in the editor sidebar against a large PDF, asserting
// the main thread stays responsive throughout.
//
// This is the check the editor-freeze bug needed. The pathology was never
// Rotate-specific: any panel that flips a byte-array prop (previewBytes) tripped
// React's dev performance-track serialiser. Testing one tool at a time is what
// made the bug take so long to find.
//
//   BENCH_ENGINE=webkit node bench/drive-sweep.mjs <url>
//   ...&tracks=1   re-enables React's tracks, i.e. the control run that must FAIL
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const pw = createRequire(fileURLToPath(new URL('../package.json', import.meta.url)))('playwright');

const browser = await pw[process.env.BENCH_ENGINE || 'webkit'].launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (e) => console.log(`  [pageerror] ${e.message}`));

const to = (p, ms, tag) =>
  Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error(`UNRESPONSIVE(${tag})`)), ms))]);

let frozen = 0;
let opened = 0;
async function alive(tag) {
  try {
    const d = await to(page.evaluate(() => window.__BENCH.maxDrift), 15000, tag);
    console.log(`      responsive (maxDrift=${d}ms)`);
    return true;
  } catch (e) {
    console.log(`      ${e.message} <<< FROZEN`);
    frozen++;
    return false;
  }
}

await page.goto(process.argv[2], { waitUntil: 'domcontentloaded' });
await page.waitForSelector('canvas', { timeout: 120000 });
await page.waitForTimeout(4000);
console.log('editor loaded');

// Sidebar icons expose their tool name via the title attribute.
const TOOLS = ['Rotate PDF', 'Crop PDF', 'Watermark', 'Page Numbers', 'Compress PDF', 'Redact PDF'];

for (const name of TOOLS) {
  console.log(`\n--- tool: ${name} ---`);
  try {
    const icon = page.locator(`button[title="${name}"]`);
    await icon.scrollIntoViewIfNeeded({ timeout: 45000 });
    await icon.click({ timeout: 45000 });
    await page.waitForTimeout(2500);
    opened++;
    console.log('    panel opened');
    if (!(await alive(`${name}:open`))) break;

    // Drive whatever control the panel offers, to force a preview prop change.
    const panel = page.locator('div.w-\\[232px\\]');
    const textbox = panel.getByRole('textbox').first();
    if (await textbox.count()) {
      await textbox.fill('CONFIDENTIAL', { timeout: 30000 });
      console.log('    typed into panel textbox');
    } else {
      const btn = panel.getByRole('button').filter({ hasNotText: /apply/i }).nth(1);
      if (await btn.count()) { await btn.click({ timeout: 30000 }); console.log('    clicked panel option'); }
    }
    await page.waitForTimeout(6000);
    if (!(await alive(`${name}:interact`))) break;
  } catch (e) {
    console.log(`    step error: ${String(e).split('\n')[0]}`);
    if (!(await alive(`${name}:after-error`))) break;
  }
}

const ok = frozen === 0 && opened === TOOLS.length;
console.log(`\n=== ${ok ? `PASS — all ${opened} tool panels stayed responsive`
  : frozen > 0 ? `FAIL — ${frozen} freeze(s)` : `INCONCLUSIVE — only ${opened}/${TOOLS.length} panels opened`} ===`);
await browser.close();
process.exit(ok ? 0 : 1);
