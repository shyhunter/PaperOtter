import { describe, it, expect, vi, afterEach } from 'vitest';
import { checkVersions } from '@/lib/checkVersion';
import type { VersionSources } from '@/lib/checkVersion';

// All versions agree — base fixture reused across tests
const allMatch: VersionSources = {
  packageJson: '1.0.0-beta.4',
  tauriConf: '1.0.0-beta.4',
  cargoToml: '1.0.0-beta.4',
  splashScreen: '1.0.0-beta.4',
  dashboardFallback: '1.0.0-beta.4',
  aboutDialogFallback: '1.0.0-beta.4',
  gitTag: undefined,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('checkVersions', () => {
  it('[VC-01] all versions match — does not call process.exit', () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    checkVersions(allMatch);
    expect(exit).not.toHaveBeenCalled();
  });

  it('[VC-01] tauri.conf.json differs from package.json — calls process.exit(1)', () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    checkVersions({ ...allMatch, tauriConf: '1.0.0-beta.3' });
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('[VC-02] Cargo.toml differs from package.json — calls process.exit(1)', () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    checkVersions({ ...allMatch, cargoToml: '1.0.0-beta.3' });
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('[VC-03] source file fallback (SplashScreen) differs — calls process.exit(1)', () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    checkVersions({ ...allMatch, splashScreen: '1.0.0-beta.1' });
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('[VC-03] source file fallback (Dashboard) differs — calls process.exit(1)', () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    checkVersions({ ...allMatch, dashboardFallback: '1.0.0-beta.2' });
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('[VC-03] source file fallback (AboutDialog) differs — calls process.exit(1)', () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    checkVersions({ ...allMatch, aboutDialogFallback: '1.0.0-beta.2' });
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('[VC-04] git tag differs from package.json — calls process.exit(1)', () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    checkVersions({ ...allMatch, gitTag: '1.0.0' }); // v1.0.0 stripped to 1.0.0 ≠ beta.4
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('[VC-04] git tag matches package.json — does not call process.exit', () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    checkVersions({ ...allMatch, gitTag: '1.0.0-beta.4' });
    expect(exit).not.toHaveBeenCalled();
  });

  it('[VC-04] gitTag is undefined (branch push, not a tag) — tag check skipped, no exit', () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    // Even if other fields are fine, undefined tag must not trigger exit
    checkVersions({ ...allMatch, gitTag: undefined });
    expect(exit).not.toHaveBeenCalled();
  });
});
