/**
 * Writes each run to `.e2e-results/`, so a run leaves something readable behind.
 *
 * The spec reporter prints to a terminal that scrolls away. These tests exist to
 * replace manual checking, and the whole point of that is being able to look at
 * what happened afterwards — including on a machine you were not sitting at.
 *
 * Two files, because they answer different questions:
 *   latest.md   — what a person reads: pass, fail, skipped, and why
 *   latest.json — what a tool reads, and what a diff between runs can use
 *
 * WDIO runs each spec file as its own runner, and gives every one of them a
 * fresh reporter instance — in its own worker process, so nothing is shared but
 * the disk. Writing the summary from `onRunnerEnd` therefore wrote it five
 * times over, each spec erasing the one before it: on 2026-09-02 a five-spec
 * run left a `latest.md` describing three tests, and the other four specs were
 * simply gone. So each runner drops a part file here, and the launcher merges
 * them in `onComplete` once the whole run is over.
 *
 * All git-ignored. Results are evidence about one machine at one moment, not a
 * fact about the repository.
 */
import WDIOReporter, { type RunnerStats, type TestStats, type SuiteStats } from '@wdio/reporter';
import { mkdirSync, writeFileSync, readdirSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { currentPlatform, skipped } from '../helpers/platform';

export interface Recorded {
  title: string;
  suite: string;
  state: 'passed' | 'failed' | 'skipped';
  durationMs: number;
  error?: string;
}

interface RunPart {
  spec: string;
  durationMs: number;
  records: Recorded[];
  skippedReasons: Array<{ spec: string; reason: string }>;
}

export const RESULTS_DIR = process.env.E2E_RESULTS_DIR ?? join(process.cwd(), '.e2e-results');
/** One file per spec file, merged by the launcher when the run finishes. */
export const PARTS_DIR = join(RESULTS_DIR, 'parts');
/**
 * How long each test took when the baseline was taken, per machine.
 *
 * Not committed, and not meant to be: a baseline is a fact about one machine,
 * and sharing one across a laptop and a CI runner produces failures that say
 * nothing about the code. Created automatically on the first run, refreshed
 * with E2E_UPDATE_BASELINE=1.
 */
export const BASELINE_FILE = join(RESULTS_DIR, 'baseline.json');

/**
 * Below this, a multiple is noise rather than news: a 20 ms test reaching 60 ms
 * is a busy scheduler, not a regression, and failing on it would teach people
 * to ignore the timing section entirely.
 */
const BASELINE_FLOOR_MS = 500;

/** The ceiling, agreed deliberately loose so a laptop under load never goes red. */
const SLOWDOWN_FACTOR = 3;

interface TimingRow {
  title: string;
  durationMs: number;
  baselineMs: number;
  ratio: number;
  breach: boolean;
}

export default class ResultsReporter extends WDIOReporter {
  private records: Recorded[] = [];
  private currentSuite = '';

  onSuiteStart(suite: SuiteStats): void {
    if (suite.type === 'suite') this.currentSuite = suite.title;
  }

  onTestPass(test: TestStats): void { this.record(test, 'passed'); }
  onTestSkip(test: TestStats): void { this.record(test, 'skipped'); }
  onTestFail(test: TestStats): void {
    // The first error line only. A WebDriver stack is thirty frames of
    // machinery and none of them are the reason the assertion failed.
    this.record(test, 'failed', test.errors?.[0]?.message?.split('\n')[0]);
  }

  private record(test: TestStats, state: Recorded['state'], error?: string): void {
    this.records.push({
      title: test.title,
      suite: this.currentSuite,
      state,
      durationMs: test._duration ?? 0,
      error,
    });
  }

  onRunnerEnd(runner: RunnerStats): void {
    const spec = basename(runner.specs?.[0] ?? 'unknown');
    const part: RunPart = {
      spec,
      durationMs: runner._duration,
      records: this.records,
      skippedReasons: skipped,
    };
    mkdirSync(PARTS_DIR, { recursive: true });
    // The pid keeps two runners of the same spec (a retry) from colliding.
    writeFileSync(join(PARTS_DIR, `${spec}.${process.pid}.json`), JSON.stringify(part) + '\n');
  }
}

/** Called by the launcher before anything runs, so a run never inherits stale parts. */
export function resetParts(): void {
  rmSync(PARTS_DIR, { recursive: true, force: true });
  mkdirSync(PARTS_DIR, { recursive: true });
}

/**
 * Merge every part into `latest.md` and `latest.json`.
 *
 * A spec file that produced no part is reported as such rather than omitted: a
 * spec that died before its first test is the most important thing on the page,
 * and leaving it out is how a truncated run reads as a short one.
 */
export function writeSummary(plannedSpecs: string[] = []): number {
  mkdirSync(RESULTS_DIR, { recursive: true });

  const parts: RunPart[] = existsSync(PARTS_DIR)
    ? readdirSync(PARTS_DIR)
        .filter((f) => f.endsWith('.json'))
        .map((f) => JSON.parse(readFileSync(join(PARTS_DIR, f), 'utf8')) as RunPart)
        .sort((a, b) => a.spec.localeCompare(b.spec))
    : [];

  const records = parts.flatMap((p) => p.records);
  const skippedReasons = parts.flatMap((p) => p.skippedReasons);
  const durationMs = parts.reduce((sum, p) => sum + p.durationMs, 0);
  const ran = new Set(parts.map((p) => p.spec));
  const missing = plannedSpecs.map((s) => basename(s)).filter((s) => !ran.has(s));

  const counts = {
    passed: records.filter((r) => r.state === 'passed').length,
    failed: records.filter((r) => r.state === 'failed').length,
    skipped: records.filter((r) => r.state === 'skipped').length,
  };
  const finishedAt = new Date().toISOString();

  const { timings, baselineWritten } = compareWithBaseline(records);
  const breaches = timings.filter((t) => t.breach);

  writeFileSync(
    join(RESULTS_DIR, 'latest.json'),
    JSON.stringify(
      {
        finishedAt,
        platform: currentPlatform(),
        durationMs,
        counts,
        specsRun: [...ran].sort(),
        specsWithNoResults: missing,
        records,
        skippedReasons,
        timings,
        timingBreaches: breaches.map((b) => b.title),
      },
      null, 2,
    ) + '\n',
  );

  writeFileSync(
    join(RESULTS_DIR, 'latest.md'),
    markdown(finishedAt, counts, durationMs, records, skippedReasons, missing, timings, baselineWritten),
  );

  return breaches.length;
}

/**
 * Measure this run against the baseline, and take one if there is none.
 *
 * Only tests that were slow enough to mean something are eligible to fail; the
 * rest are reported so drift stays visible without anyone being trained to
 * ignore a red run.
 */
function compareWithBaseline(records: Recorded[]): { timings: TimingRow[]; baselineWritten: boolean } {
  const ran = records.filter((r) => r.state === 'passed');
  const current: Record<string, number> = {};
  for (const r of ran) current[r.title] = r.durationMs;

  const refresh = process.env.E2E_UPDATE_BASELINE === '1';
  const have = !refresh && existsSync(BASELINE_FILE);

  if (!have) {
    writeFileSync(BASELINE_FILE, JSON.stringify(current, null, 2) + '\n');
    return { timings: [], baselineWritten: true };
  }

  const baseline = JSON.parse(readFileSync(BASELINE_FILE, 'utf8')) as Record<string, number>;
  const timings: TimingRow[] = [];
  for (const r of ran) {
    const baselineMs = baseline[r.title];
    // A test with no baseline is new. Nothing to compare it against, and
    // inventing one from this single run would bake in whatever the machine was
    // doing at the time.
    if (typeof baselineMs !== 'number' || baselineMs <= 0) continue;
    const ratio = r.durationMs / baselineMs;
    timings.push({
      title: r.title,
      durationMs: r.durationMs,
      baselineMs,
      ratio,
      breach: baselineMs >= BASELINE_FLOOR_MS && ratio > SLOWDOWN_FACTOR,
    });
  }
  return { timings, baselineWritten: false };
}

function markdown(
  finishedAt: string,
  counts: { passed: number; failed: number; skipped: number },
  durationMs: number,
  records: Recorded[],
  skippedReasons: Array<{ spec: string; reason: string }>,
  missing: string[],
  timings: TimingRow[],
  baselineWritten: boolean,
): string {
  const breaches = timings.filter((t) => t.breach);
  const ok = counts.failed === 0 && missing.length === 0 && breaches.length === 0;
  const lines: string[] = [
    '# PaperOtter regression run',
    '',
    `- **When:** ${finishedAt}`,
    `- **Platform:** ${currentPlatform()}`,
    `- **Duration:** ${(durationMs / 1000).toFixed(1)}s`,
    `- **Result:** ${ok ? 'PASS' : 'FAIL'} — ${counts.passed} passed, ${counts.failed} failed, ${counts.skipped} skipped`,
    '',
  ];

  if (missing.length > 0) {
    // Louder than a failure, because it is worse: a spec that never reported
    // has no result at all, and a run that quietly drops one is a run that
    // reports green for tests it never ran.
    lines.push('## Never reported', '');
    lines.push('These spec files produced no results — they crashed, or the run stopped early.', '');
    for (const m of missing) lines.push(`- **${m}**`);
    lines.push('');
  }

  if (counts.failed > 0) {
    // Failures first and in full. Anything that has to be scrolled to is
    // something somebody will eventually stop scrolling to.
    lines.push('## Failed', '');
    for (const r of records.filter((r) => r.state === 'failed')) {
      lines.push(`- **${r.title}** — ${r.error ?? 'no message'}`);
    }
    lines.push('', 'Screenshots and DOM snapshots for each: `.e2e-artifacts/`', '');
  }

  if (skippedReasons.length > 0) {
    lines.push('## Skipped, and why', '');
    lines.push('A green run below is not full coverage — these did not execute on this machine.', '');
    for (const s of skippedReasons) lines.push(`- **${s.spec}** — ${s.reason}`);
    lines.push('');
  }

  if (baselineWritten) {
    lines.push('## Timing baseline taken', '');
    lines.push('No baseline existed on this machine, so this run became it. The next run compares against these times.', '');
  } else if (breaches.length > 0) {
    lines.push(`## Slower than baseline (over ${SLOWDOWN_FACTOR}x)`, '');
    for (const t of breaches) {
      lines.push(`- **${t.title}** — ${(t.durationMs / 1000).toFixed(1)}s against a ${(t.baselineMs / 1000).toFixed(1)}s baseline (${t.ratio.toFixed(1)}x)`);
    }
    lines.push('', 'Refresh the baseline with `E2E_UPDATE_BASELINE=1` once the change is understood and wanted.', '');
  }

  if (timings.length > 0) {
    // Drift both ways, so a slow creep is visible long before it trips the
    // ceiling — and so a sudden speed-up gets looked at too, since the usual
    // reason a test gets much faster is that it stopped doing something.
    const drifted = timings
      .filter((t) => t.baselineMs >= BASELINE_FLOOR_MS && (t.ratio >= 1.5 || t.ratio <= 0.5))
      .sort((a, b) => b.ratio - a.ratio);
    if (drifted.length > 0) {
      lines.push('## Timing drift', '');
      lines.push('| Test | This run | Baseline | Change |', '|---|---|---|---|');
      for (const t of drifted) {
        lines.push(`| ${t.title} | ${(t.durationMs / 1000).toFixed(1)}s | ${(t.baselineMs / 1000).toFixed(1)}s | ${t.ratio.toFixed(1)}x |`);
      }
      lines.push('');
    }
  }

  lines.push('## Everything that ran', '');
  lines.push('| Result | Test | Time |', '|---|---|---|');
  for (const r of records) {
    const mark = r.state === 'passed' ? 'pass' : r.state === 'failed' ? 'FAIL' : 'skip';
    lines.push(`| ${mark} | ${r.title} | ${(r.durationMs / 1000).toFixed(1)}s |`);
  }
  return lines.join('\n') + '\n';
}
