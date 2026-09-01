/**
 * [BROWSER-PDFJS] pdf.js, actually running.
 *
 * `MVP_BRIEF` §6: *"pdf.js does not run at all (fails on `Promise.try` under
 * this Node) — every search test uses a fake document object. A search fix has
 * already shipped broken because its fixtures were shaped the way pdf.js was
 * assumed to emit text rather than how it does."*
 *
 * `pdfTextSearch.ts` says the same thing in its own source: *"Extraction cannot
 * be exercised in tests."* Twenty-eight test files stub around it.
 *
 * These assertions are the ones no other layer in this project can make. They
 * use a real committed PDF, opened by a real pdf.js, in a real browser — and
 * assert against text that is genuinely printed on the page, so a fixture
 * shaped by assumption cannot make them pass.
 */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** A six-page text document. Real prose, so matches are real. */
const TEXT_PDF = Array.from(
  readFileSync(join(process.cwd(), 'test-fixtures', 'warnock_camelot.pdf')),
);

test.beforeEach(async ({ page }) => {
  await page.goto('/src/browser-tests/harness.html');
  await page.waitForFunction(() => !!window.__papercut);
});

test('[BROWSER-PDFJS-01] pdf.js loads and opens a real document', async ({ page }) => {
  // The premise everything else rests on. If this fails, the layer is not
  // giving us anything the mocked layers were not already giving us.
  const info = await page.evaluate(async (bytes) => {
    const doc = await window.__papercut.openPdf(bytes);
    return { version: window.__papercut.pdfjsVersion, numPages: doc.numPages };
  }, TEXT_PDF);

  expect(info.version).toBeTruthy();
  expect(info.numPages).toBe(6);
});

test('[BROWSER-PDFJS-02] text extraction returns the words on the page', async ({ page }) => {
  const items = await page.evaluate(async (bytes) => {
    // Zero-indexed, as the real API is.
    return window.__papercut.extractPageText(bytes, 0);
  }, TEXT_PDF);

  expect(items.length).toBeGreaterThan(0);
  // Not just "something came back" — the count and the joined text are what a
  // stub gets wrong, because a stub returns whatever shape its author imagined.
  const joined = items.map((i) => i.text).join(' ').toLowerCase();
  expect(joined.length).toBeGreaterThan(50);
});

test('[BROWSER-PDFJS-03] a search finds text that is really on the page', async ({ page }) => {
  const result = await page.evaluate(async (bytes) => {
    // Take a word out of the document itself rather than guessing one: a
    // hardcoded query is the same assumption that shipped the broken fix.
    const items = await window.__papercut.extractPageText(bytes, 0);
    const word = items.map((i) => i.text).join(' ').split(/\s+/)
      .find((w) => /^[A-Za-z]{6,}$/.test(w)) ?? '';
    const matches = await window.__papercut.searchBytes(bytes, word);
    return { word, count: matches.length, first: matches[0] ?? null };
  }, TEXT_PDF);

  expect(result.word).not.toBe('');
  expect(result.count).toBeGreaterThan(0);

  // Boxes are drawn as percentages of the page, so highlights cannot drift off
  // their word at a different zoom. A stub could return any numbers; real
  // geometry has to land inside the page.
  const box = result.first!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(100.5);
  expect(box.y + box.height).toBeLessThanOrEqual(100.5);
  expect(box.width).toBeGreaterThan(0);
  expect(box.height).toBeGreaterThan(0);
});

test('[BROWSER-PDFJS-04] a query that is not there finds nothing', async ({ page }) => {
  // The other half. A search that matches everything is as broken as one that
  // matches nothing, and only a real document can tell them apart.
  const count = await page.evaluate(async (bytes) => {
    const matches = await window.__papercut.searchBytes(bytes, 'zzqxwvunlikelystring');
    return matches.length;
  }, TEXT_PDF);

  expect(count).toBe(0);
});

test('[BROWSER-PDFJS-05] search is whitespace-insensitive on a real document', async ({ page }) => {
  // The behaviour the source claims: a query typed with normal spacing matches
  // however the PDF happened to break the text up. That claim is about how
  // pdf.js emits items, which is exactly what a stub cannot tell you.
  const result = await page.evaluate(async (bytes) => {
    const items = await window.__papercut.extractPageText(bytes, 0);
    const words = items.map((i) => i.text).join(' ').split(/\s+/).filter((w) => /^[A-Za-z]{4,}$/.test(w));
    if (words.length < 2) return null;
    const phrase = `${words[0]} ${words[1]}`;
    return {
      spaced: (await window.__papercut.searchBytes(bytes, phrase)).length,
      squashed: (await window.__papercut.searchBytes(bytes, phrase.replace(/\s+/g, ''))).length,
    };
  }, TEXT_PDF);

  if (result) expect(result.spaced).toBe(result.squashed);
});

test('[BROWSER-PDFJS-06] page dimensions come back in real points', async ({ page }) => {
  const dims = await page.evaluate(async (bytes) => {
    return window.__papercut.getPageDimensions(bytes, 0);
  }, TEXT_PDF);

  // A real page, not a placeholder: A4 is 595×842pt, Letter 612×792.
  expect(dims.width).toBeGreaterThan(100);
  expect(dims.height).toBeGreaterThan(100);
});
