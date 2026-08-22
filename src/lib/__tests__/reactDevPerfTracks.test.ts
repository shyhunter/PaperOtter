// Regression tests for the editor freeze on large PDFs.
//
// Root cause: React 19.2 shipped dev-only "Performance Tracks". On every render
// where a prop CHANGED, react-dom serialises the new prop value into a
// performance.measure() detail payload (logComponentRender ->
// addObjectDiffToProperties -> addValueToProperties). A Uint8Array falls into
// the generic-object branch, which walks it with `for…in` — one row per BYTE.
// Opening a 30 MB PDF and clicking a tool (previewBytes flips null -> pdfBytes)
// therefore built a ~30 000 000-row array and structured-cloned it on the main
// thread: 100 % CPU, ~1.3 GB RSS, never finishes.
//
// Verified in a real browser (WebKit, 42 MB/688-page fixture): frozen before the
// guard, "Turn Right" completes in ~5.4 s after it. Production builds were never
// affected — react-dom.production.js contains zero performance.measure calls.
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { disableReactDevPerformanceTracks } from '../reactDevPerfTracks';

const REPO_ROOT = resolve(__dirname, '../../..');
const REACT_DOM_DEV = resolve(REPO_ROOT, 'node_modules/react-dom/cjs/react-dom-client.development.js');

describe('disableReactDevPerformanceTracks', () => {
  const original = Object.getOwnPropertyDescriptor(console, 'timeStamp');
  afterEach(() => {
    if (original) Object.defineProperty(console, 'timeStamp', original);
  });

  it('removes console.timeStamp, which is what react-dom gates the feature on', () => {
    (console as unknown as { timeStamp: () => void }).timeStamp = () => {};
    disableReactDevPerformanceTracks();
    expect(typeof (console as unknown as { timeStamp?: unknown }).timeStamp).not.toBe('function');
  });

  it('is safe to call when console.timeStamp is already absent', () => {
    delete (console as unknown as { timeStamp?: unknown }).timeStamp;
    expect(() => disableReactDevPerformanceTracks()).not.toThrow();
  });

  it('leaves performance.measure intact — only react-dom\'s gate is targeted', () => {
    disableReactDevPerformanceTracks();
    expect(typeof performance.measure).toBe('function');
  });
});

describe('the react-dom assumptions this guard depends on', () => {
  it('still gates its performance tracks on console.timeStamp', () => {
    // If a React upgrade changes this gate, the guard silently stops working and
    // the freeze comes back. Fail here instead of in the user's hands.
    const src = readFileSync(REACT_DOM_DEV, 'utf8');
    expect(src).toMatch(/supportsUserTiming\s*=[\s\S]{0,200}?console\.timeStamp/);
  });

  it('still serialises changed props into the measure detail payload', () => {
    const src = readFileSync(REACT_DOM_DEV, 'utf8');
    expect(src).toContain('addObjectDiffToProperties');
    expect(src).toContain('performance.measure');
  });

  it('has no performance.measure calls in the production build', () => {
    // Documents why this is a dev-only guard: shipped builds were never affected.
    const prod = readFileSync(
      resolve(REPO_ROOT, 'node_modules/react-dom/cjs/react-dom-client.production.js'), 'utf8');
    expect(prod).not.toContain('performance.measure');
  });
});

describe('why a Uint8Array prop is catastrophic to serialise', () => {
  it('enumerates one own key per byte under for…in', () => {
    // This is exactly what react-dom's addObjectToProperties does to the value.
    const bytes = new Uint8Array(50_000);
    let keys = 0;
    for (const key in bytes) {
      if (Object.prototype.hasOwnProperty.call(bytes, key)) keys++;
    }
    expect(keys).toBe(50_000);
    // A 30 MB PDF prop therefore produces ~30 million rows.
  });
});

describe('main.tsx wiring', () => {
  it('installs the guard before react-dom is imported', () => {
    // react-dom reads supportsUserTiming once, at module-evaluation time, so the
    // guard is only effective if its import comes first. Import order here is
    // load-bearing, not cosmetic.
    const main = readFileSync(resolve(REPO_ROOT, 'src/main.tsx'), 'utf8');
    const guardIdx = main.indexOf('reactDevPerfTracks');
    const reactDomIdx = main.indexOf('react-dom/client');
    expect(guardIdx).toBeGreaterThanOrEqual(0);
    expect(reactDomIdx).toBeGreaterThanOrEqual(0);
    expect(guardIdx).toBeLessThan(reactDomIdx);
  });
});
