// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ghostscriptHint } from '@/hooks/useDependencies';

// ─── Dependency hints (DEP-01) ───────────────────────────────────────────────
//
// The Ghostscript hint claimed "Ghostscript is bundled with Papercut. If
// unavailable, reinstall the app". Ghostscript is only really bundled for Apple
// Silicon — the other three platforms ship a stub — so on those the hint sent
// the user to reinstall something that would never work.

const setUserAgent = (ua: string) => vi.stubGlobal('navigator', { userAgent: ua });
afterEach(() => vi.unstubAllGlobals());

describe('ghostscriptHint', () => {
  it('[DEP-01a] never claims Ghostscript is bundled', () => {
    for (const ua of ['Macintosh; Intel Mac OS X', 'Windows NT 10.0', 'X11; Linux x86_64']) {
      setUserAgent(ua);
      expect(ghostscriptHint()).not.toMatch(/bundled/i);
      // "reinstall the app" is the specific bad advice: it cannot help.
      expect(ghostscriptHint()).not.toMatch(/reinstall/i);
    }
  });

  it('[DEP-01b] gives the macOS user a command that works', () => {
    setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)');
    expect(ghostscriptHint()).toMatch(/brew install ghostscript/);
  });

  it('[DEP-01c] points a Windows user at the Windows installer, not brew', () => {
    setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
    expect(ghostscriptHint()).toMatch(/ghostscript\.com/i);
    expect(ghostscriptHint()).not.toMatch(/brew/);
  });

  it('[DEP-01d] gives a Linux user their package manager', () => {
    setUserAgent('Mozilla/5.0 (X11; Linux x86_64)');
    expect(ghostscriptHint()).toMatch(/apt|package manager/i);
    expect(ghostscriptHint()).not.toMatch(/brew/);
  });

  it('[DEP-01e] says what the dependency is actually for', () => {
    setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)');
    expect(ghostscriptHint()).toMatch(/compress/i);
  });
});
