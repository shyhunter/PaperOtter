import { describe, it, expect } from 'vitest';
import { readFileSync, globSync } from 'node:fs';
import { TOOL_REGISTRY } from '@/types/tools';

/**
 * One way a file enters a tool.
 *
 * There were two. Compress PDF and Compress Image used LandingCard -- Open file
 * beside Drop file here -- behind nine guards. The other seventeen tools each
 * hand-rolled a Select PDF button with none of them, and `useFileDrop` was
 * called in exactly one place in the whole app: dropping a file on the dashboard
 * worked, and dropping the same file after opening Redact PDF did nothing at
 * all, silently.
 *
 * These check the shape rather than the behaviour, because the failure mode is
 * drift -- the next tool written the old way, or a guard quietly skipped.
 */

const COMPONENTS = globSync('src/components/**/*.tsx').filter((f) => !f.includes('__tests__'));
const APP = 'src/App.tsx';

describe('[UI-PICK-01] every tool picks files the same way', () => {
  it('has no hand-rolled picker left', () => {
    const offenders = COMPONENTS.filter((f) => {
      if (f.endsWith('LandingCard.tsx') || f.endsWith('FilePickStep.tsx')) return false;
      return readFileSync(f, 'utf-8').includes('data-testid="open-file-btn"');
    });

    expect(offenders, 'these draw their own file picker instead of FilePickStep').toEqual([]);
  });

  it('opens the tool dialog in one place', () => {
    // Each flow used to call the dialog plugin itself, which is how they all
    // ended up with different filters and no size or magic-byte check.
    //
    // Scoped to the flows and their steps: other dialogs are a different job --
    // choosing a signature image, a recent folder, a save location -- and those
    // stay where they are.
    const flows = COMPONENTS.filter((f) => /(Flow|PickStep)\.tsx$/.test(f) && !f.endsWith('FilePickStep.tsx'));
    const offenders = flows.filter((f) => /\bawait open\(\{/.test(readFileSync(f, 'utf-8')));

    expect(offenders, 'these open a file dialog directly').toEqual([]);
  });

  it('listens for a drop in one place', () => {
    // The bug this replaces: seventeen tools rendered a drop-shaped screen and
    // ignored anything dropped on it.
    const users = [...COMPONENTS, APP, ...globSync('src/hooks/**/*.ts')]
      .filter((f) => !f.endsWith('useFileDrop.ts') && !f.includes('__tests__'))
      .filter((f) => readFileSync(f, 'utf-8').includes('useFileDrop('));

    expect(users).toEqual(['src/components/FilePickStep.tsx']);
  });

  it('consumes a dashboard drop in one place', () => {
    // Eighteen copies of a StrictMode-sensitive guard, three of which did their
    // work during render. One is enough, and it is the one behind the guards.
    const offenders = COMPONENTS.filter((f) => {
      if (f.endsWith('FilePickStep.tsx')) return false;
      return readFileSync(f, 'utf-8').includes('pendingFiles');
    });

    expect(offenders, 'these consume pendingFiles themselves').toEqual([]);
  });
});

describe('[UI-PICK-02] the guards the shared picker exists for', () => {
  const src = readFileSync('src/components/FilePickStep.tsx', 'utf-8');

  // Each marker is the refusal itself, not the symbol it needs. Checking for
  // the import would pass on a guard whose body had been deleted.
  it.each([
    ['an unsupported format', 'const format = detectFormat(filePath);\n      if (!format) {'],
    ['a format this tool does not take', 'if (!acceptedFormats.includes(format)) {'],
    ['a HEIC this platform cannot decode', 'if (isHeicPath(filePath) && !isHeicDecodable()) {'],
    ['a file too large to work on', 'if (sizeBytes > FILE_SIZE_LIMIT_BYTES) {'],
    ['an empty file', 'if (sizeBytes === 0) {'],
    ['a PDF without PDF magic bytes', 'if (!isPdfHeader(allBytes.slice(0, 5))) {'],
    ['a file we are not allowed to read', 'if (isPermissionError(err)) {'],
  ])('refuses %s', (_case, marker) => {
    expect(src).toContain(marker);
  });
});

describe('[UI-PICK-03] one name for one screen', () => {
  it('calls the first step the same thing in every tool', () => {
    // Four names for one screen: Pick, Select PDF, Pick Images, Pick Files.
    // They are the same screen now, so they are the same word.
    const first = Object.values(TOOL_REGISTRY).map((tool) => tool.steps[0].label);
    expect(new Set(first)).toEqual(new Set(['step.pick']));
  });

  it('calls the last step the same thing in every tool', () => {
    const last = Object.values(TOOL_REGISTRY).map((tool) => tool.steps[tool.steps.length - 1].label);
    expect(new Set(last)).toEqual(new Set(['step.save']));
  });
});
