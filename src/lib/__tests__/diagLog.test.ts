// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * [DIAG-01] The diagnostic logger must not run in a shipped build.
 *
 * Confirmed on a real Linux build on 2026-08-30: every launch painted a green
 * bar across the top of the window reading "DIAG-OK: /home/.../Downloads/
 * papercut-diag.log", at z-index 999999 and with no timeout, because
 * diagLogReset() runs unconditionally from main.tsx. It also wrote a file into
 * the user's Downloads folder and started a 500ms heartbeat that never stops.
 *
 * Invisible to every automated check: types, lint, unit tests and CI all passed
 * on it for weeks. It took installing the .deb and looking at the window.
 *
 * The logger stays -- it is the instrument for the next freeze-shaped bug -- but
 * it is now inert unless import.meta.env.DEV.
 */

const writeFile = vi.fn();
vi.mock('@tauri-apps/plugin-fs', () => ({ writeFile: (...a: unknown[]) => writeFile(...a) }));
vi.mock('@tauri-apps/api/path', () => ({
  downloadDir: () => Promise.resolve('/home/tester/Downloads'),
  join: (...parts: string[]) => Promise.resolve(parts.join('/')),
}));

const banner = () => document.getElementById('diag-banner');

beforeEach(() => {
  vi.resetModules();
  writeFile.mockReset();
  document.body.innerHTML = '';
});
afterEach(() => vi.unstubAllEnvs());

describe('diagLog is development-only', () => {
  it('[DIAG-01a] writes nothing and shows no banner in a production build', async () => {
    vi.stubEnv('DEV', false);
    const { diagLogReset, diagLog } = await import('@/lib/diagLog');

    await diagLogReset();
    diagLog('something happened');
    await new Promise((r) => setTimeout(r, 0));

    expect(writeFile, 'a shipped build must not write to Downloads').not.toHaveBeenCalled();
    expect(banner(), 'a shipped build must not paint a debug banner').toBeNull();
  });

  it('[DIAG-01b] still works in development', async () => {
    vi.stubEnv('DEV', true);
    const { diagLogReset } = await import('@/lib/diagLog');

    await diagLogReset();

    expect(writeFile, 'the instrument must still work where it is useful').toHaveBeenCalled();
    expect(banner()).not.toBeNull();
    expect(banner()?.textContent).toMatch(/DIAG-OK/);
  });

  it('[DIAG-01c] logs written in dev reach the file', async () => {
    vi.stubEnv('DEV', true);
    const { diagLogReset, diagLog } = await import('@/lib/diagLog');

    await diagLogReset();
    writeFile.mockClear();
    diagLog('editor froze');
    await new Promise((r) => setTimeout(r, 0));

    expect(writeFile).toHaveBeenCalled();
    // Index rather than .at(): tsconfig's lib target predates ES2022.
    const calls = writeFile.mock.calls;
    const bytes = calls[calls.length - 1][1] as Uint8Array;
    expect(new TextDecoder().decode(bytes)).toContain('editor froze');
  });

  it('[DIAG-01d] the production check is read per call, not frozen at import', async () => {
    // The platform gate shipped with this exact bug first: a module-scope
    // constant is unstubbable, so no test can exercise the other branch.
    vi.stubEnv('DEV', false);
    const mod = await import('@/lib/diagLog');
    await mod.diagLogReset();
    expect(writeFile).not.toHaveBeenCalled();

    vi.stubEnv('DEV', true);
    await mod.diagLogReset();
    expect(writeFile, 'same module instance must honour a changed flag').toHaveBeenCalled();
  });
});
