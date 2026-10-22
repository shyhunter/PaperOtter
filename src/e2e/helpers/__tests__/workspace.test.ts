import { describe, it, expect, afterAll } from 'vitest';
import { statSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { Workspace } from '../workspace';

/**
 * [E2E-TMP-01] The e2e scratch area is private and unguessable.
 *
 * It used to be `$TMPDIR/papercut-e2e-<pid>-<time>`, created with mkdirSync.
 * Anyone else on the machine could predict that name and plant the folder, or a
 * symlink, before the run did; CodeQL flagged it (js/insecure-temporary-file)
 * once a spec started writing files into it. mkdtemp picks a random name and
 * creates it owner-only, atomically.
 */
const ws = new Workspace('tmp-check');
afterAll(() => ws.cleanup());

describe('[E2E-TMP-01] workspace temp directory', () => {
  it('lives in a directory only this user can enter', () => {
    const mode = statSync(dirname(ws.dir)).mode & 0o777;
    expect(mode).toBe(0o700);
  });

  it('is not named after anything another user can predict', () => {
    expect(dirname(ws.dir)).not.toContain(String(process.pid));
  });

  it('writes files that read back', () => {
    const path = ws.write('probe.txt', 'ok');
    expect(readFileSync(path, 'utf-8')).toBe('ok');
  });
});
