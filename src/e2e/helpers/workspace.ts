/**
 * A scratch workspace each spec builds for itself.
 *
 * The point of this file is that a regression test needs no preparation from
 * whoever runs it. Every fixture these specs use — a read-only PDF, one that
 * disappears mid-flow, one that gets renamed — is created here, from a real
 * committed fixture, and torn down afterwards. Nobody types `cp` or `chmod`.
 *
 * Everything lives under the system temp directory on purpose: Tauri's
 * capability scope (`src-tauri/capabilities/default.json`) permits `$TEMP/**`,
 * and a file outside the allowed roots is refused by the backend before any of
 * this app's own logic runs. A workspace in the repo would fail for a reason
 * that has nothing to do with what is being tested.
 */
import {
  mkdirSync, rmSync, copyFileSync, chmodSync, renameSync,
  readFileSync, writeFileSync, existsSync, statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REAL_FIXTURES_DIR } from './driver';

/** One directory per run, so a crashed run never poisons the next one. */
const RUN_ID = `${process.pid}-${Date.now().toString(36)}`;

export class Workspace {
  readonly dir: string;

  constructor(name: string) {
    this.dir = join(tmpdir(), `papercut-e2e-${RUN_ID}`, name);
    mkdirSync(this.dir, { recursive: true });
  }

  /** Copy a committed fixture in under a new name, and return its path. */
  fixture(sourceName: string, asName = sourceName): string {
    const target = join(this.dir, asName);
    copyFileSync(join(REAL_FIXTURES_DIR, sourceName), target);
    // Always writable to begin with: a fixture inherits the mode of whatever it
    // was copied from, and a previous run's read-only file would make FP-01
    // pass for the wrong reason.
    chmodSync(target, 0o644);
    return target;
  }

  /** A subdirectory of this workspace, created if needed. */
  subdir(name: string): string {
    const path = join(this.dir, name);
    mkdirSync(path, { recursive: true });
    return path;
  }

  /** Make a file read-only — FP-01's whole premise. */
  makeReadOnly(path: string): void {
    chmodSync(path, 0o444);
  }

  /** Give write permission back — what FP-04's second attempt depends on. */
  makeWritable(path: string): void {
    chmodSync(path, 0o644);
  }

  /**
   * Remove a file while the app is holding it open — FP-02.
   *
   * Read the bytes first where a test needs to compare them afterwards; once
   * this returns there is nothing left to read.
   */
  remove(path: string): void {
    rmSync(path, { force: true });
  }

  /**
   * Rename a file out from under the app — FP-03, and what "move to Trash"
   * actually is on Linux.
   */
  rename(from: string, to: string): string {
    const target = join(this.dir, to);
    renameSync(from, target);
    return target;
  }

  size(path: string): number {
    return statSync(path).size;
  }

  bytes(path: string): Buffer {
    return readFileSync(path);
  }

  exists(path: string): boolean {
    return existsSync(path);
  }

  /** Write arbitrary bytes, for the few cases with no committed fixture. */
  write(name: string, contents: Buffer | string): string {
    const target = join(this.dir, name);
    writeFileSync(target, contents);
    return target;
  }

  /**
   * Restore write permission on everything before deleting.
   *
   * A read-only file in a read-only-ish tree can defeat `rm -r` on some
   * systems, and a workspace that cannot clean itself up leaves the next run
   * fighting yesterday's leftovers.
   */
  cleanup(): void {
    try {
      rmSync(this.dir, { recursive: true, force: true });
    } catch {
      // Never fail a test over teardown. The run directory is under $TEMP and
      // the OS reclaims it; a leaked folder is not worth a red suite.
    }
  }
}

/** Remove the whole run directory — called once after the last spec. */
export function cleanupAllWorkspaces(): void {
  try {
    rmSync(join(tmpdir(), `papercut-e2e-${RUN_ID}`), { recursive: true, force: true });
  } catch {
    /* see above */
  }
}
