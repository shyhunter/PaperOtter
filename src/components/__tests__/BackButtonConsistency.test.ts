import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * [BACK] One control, one place, whatever tool you are in.
 *
 * Reported from a real session: "the Back button position is not like other
 * features". It was not a matter of taste. Twenty-one flows put Back in a
 * bottom bar as `<Button variant="outline" size="sm">`; SignatureCreateStep
 * alone hand-rolled a `<button>` inline beside the heading, so the control
 * moved between steps of the same job.
 *
 * A source scan rather than a rendered assertion, in the shape of
 * ScrollContainers and ToolIcons: nothing connects these files, so the next
 * step anyone writes would drift the same way in silence, and jsdom computes
 * no layout to catch it with.
 */

function tsxFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry !== '__tests__' && entry !== 'ui') tsxFiles(full, acc);
    } else if (entry.endsWith('.tsx')) acc.push(full);
  }
  return acc;
}

/**
 * The element that owns a Back label, with the tag that opens it.
 *
 * Walks up from the label to its opening tag rather than pattern-matching a
 * whole element: these are formatted across several lines, and a single-line
 * regex would quietly match nothing and pass.
 */
function backControls(src: string): { file: string; tag: string }[] {
  const lines = src.split('\n');
  const out: { file: string; tag: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/\{t\('common\.back'\)\}/.test(lines[i])) continue;
    for (let j = i; j >= 0 && i - j < 14; j--) {
      const m = lines[j].match(/<(Button|button)\b/);
      if (m) { out.push({ file: '', tag: m[1] }); break; }
    }
  }
  return out;
}

describe('the Back control', () => {
  const files = tsxFiles('src/components');

  it('[BACK-01] the scan finds the Back controls it is meant to check', () => {
    // Guard the guard: a traversal that matched nothing would pass vacuously,
    // which is how the scroll guard missed the component that broke.
    const total = files.reduce((n, f) => n + backControls(readFileSync(f, 'utf8')).length, 0);
    expect(total, 'sanity: found Back controls across the flows').toBeGreaterThan(15);
  });

  it('[BACK-03] every Compare step has a Back at all', () => {
    // BACK-01 and BACK-02 check how a Back is built and where it sits, which
    // says nothing about one that was never written. Convert Document's Compare
    // step had no Back: the only way out of a conversion you wanted to adjust
    // was the Process-another link, which discards it and returns to the file
    // picker. Reported as "the back button is missing there too".
    //
    // The three Compare steps are one screen in three flows -- same strip, same
    // order, Back | spacer | Process another | Save -- so this is a list, not a
    // heuristic: a heuristic broad enough to find them would flag half the app.
    const COMPARE_STEPS = [
      'src/components/CompareStep.tsx',
      'src/components/ImageCompareStep.tsx',
      'src/components/convert-doc/ConvertCompareStep.tsx',
    ];

    const missing = COMPARE_STEPS.filter((file) => {
      const src = readFileSync(file, 'utf8');
      return !/data-testid="back-btn"/.test(src) || backControls(src).length === 0;
    });

    expect(missing, 'Compare steps with no way back to Configure').toEqual([]);
  });

  it('[BACK-02] every Back uses the shared Button, not a hand-rolled one', () => {
    const rogue: string[] = [];
    for (const file of files) {
      for (const { tag } of backControls(readFileSync(file, 'utf8'))) {
        // Lowercase `button` is a raw element: it carries its own padding,
        // border and hover, so it agrees with the rest of the app only by
        // coincidence and stops agreeing the moment the shared one changes.
        if (tag === 'button') rogue.push(file);
      }
    }
    expect(rogue, 'Back controls that do not use the shared Button').toEqual([]);
  });
});
