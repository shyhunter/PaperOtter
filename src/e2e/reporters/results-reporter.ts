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
 * Both are git-ignored. Results are evidence about one machine at one moment,
 * not a fact about the repository.
 */
import WDIOReporter, { type RunnerStats, type TestStats, type SuiteStats } from '@wdio/reporter';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { currentPlatform, skipped } from '../helpers/platform';

interface Recorded {
  title: string;
  suite: string;
  state: 'passed' | 'failed' | 'skipped';
  durationMs: number;
  error?: string;
}

export const RESULTS_DIR = process.env.E2E_RESULTS_DIR ?? join(process.cwd(), '.e2e-results');

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
    mkdirSync(RESULTS_DIR, { recursive: true });
    const finishedAt = new Date().toISOString();
    const counts = {
      passed: this.records.filter((r) => r.state === 'passed').length,
      failed: this.records.filter((r) => r.state === 'failed').length,
      skipped: this.records.filter((r) => r.state === 'skipped').length,
    };

    writeFileSync(
      join(RESULTS_DIR, 'latest.json'),
      JSON.stringify(
        { finishedAt, platform: currentPlatform(), durationMs: runner._duration, counts, records: this.records, skippedReasons: skipped },
        null, 2,
      ) + '\n',
    );
    writeFileSync(join(RESULTS_DIR, 'latest.md'), this.markdown(finishedAt, counts, runner._duration));
  }

  private markdown(
    finishedAt: string,
    counts: { passed: number; failed: number; skipped: number },
    durationMs: number,
  ): string {
    const lines: string[] = [
      '# Papercut regression run',
      '',
      `- **When:** ${finishedAt}`,
      `- **Platform:** ${currentPlatform()}`,
      `- **Duration:** ${(durationMs / 1000).toFixed(1)}s`,
      `- **Result:** ${counts.failed === 0 ? 'PASS' : 'FAIL'} — ${counts.passed} passed, ${counts.failed} failed, ${counts.skipped} skipped`,
      '',
    ];

    if (counts.failed > 0) {
      // Failures first and in full. Anything that has to be scrolled to is
      // something somebody will eventually stop scrolling to.
      lines.push('## Failed', '');
      for (const r of this.records.filter((r) => r.state === 'failed')) {
        lines.push(`- **${r.title}** — ${r.error ?? 'no message'}`);
      }
      lines.push('');
    }

    if (skipped.length > 0) {
      lines.push('## Skipped, and why', '');
      lines.push('A green run below is not full coverage — these did not execute on this machine.', '');
      for (const s of skipped) lines.push(`- **${s.spec}** — ${s.reason}`);
      lines.push('');
    }

    lines.push('## Everything that ran', '');
    lines.push('| Result | Test | Time |', '|---|---|---|');
    for (const r of this.records) {
      const mark = r.state === 'passed' ? 'pass' : r.state === 'failed' ? 'FAIL' : 'skip';
      lines.push(`| ${mark} | ${r.title} | ${(r.durationMs / 1000).toFixed(1)}s |`);
    }
    return lines.join('\n') + '\n';
  }
}
