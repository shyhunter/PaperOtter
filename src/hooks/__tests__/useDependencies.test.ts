// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ghostscriptHint } from '@/hooks/useDependencies';

// ─── Dependency hints (DEP-01) ───────────────────────────────────────────────
//
// The hint once claimed "Ghostscript is bundled with Papercut. If unavailable,
// reinstall the app", and was changed because Ghostscript was only really
// bundled for Apple Silicon — the other platforms shipped a stub, so reinstalling
// could never help.
//
// That premise expired. Verified 2026-08-28 during REL-02: real Ghostscript
// binaries are committed for macOS arm64 (27 MB), macOS x86_64 (28 MB) and Linux
// (29 MB); only Windows still holds a 60-byte placeholder, which CI replaces from
// Artifex's installer at release time. Both macOS slices link nothing but
// /usr/lib/libSystem and /usr/lib/libiconv, so they need no Homebrew at all.
//
// So on macOS the hint was telling a user to `brew install ghostscript` for a
// program the app already ships — and a user without Homebrew cannot follow that
// advice at all, since Homebrew is itself a large third-party install. On macOS
// the honest advice is the one that was removed: reinstall, because reinstalling
// really does restore the bundled binary.

const setUserAgent = (ua: string) => vi.stubGlobal('navigator', { userAgent: ua });
afterEach(() => vi.unstubAllGlobals());

describe('ghostscriptHint', () => {
  it('[DEP-01a] never promises a bundled Ghostscript where none is bundled', () => {
    // Windows still ships the placeholder locally, so "reinstall" remains advice
    // that cannot help there. Scoped to Windows deliberately: on macOS the binary
    // really is in the bundle, and pretending otherwise is what caused the bug.
    setUserAgent('Windows NT 10.0');
    expect(ghostscriptHint()).not.toMatch(/bundled|included with/i);
    expect(ghostscriptHint()).not.toMatch(/reinstall/i);
  });

  it('[DEP-01b] never asks a macOS user to install third-party software', () => {
    // The app ships Ghostscript for both macOS architectures. Sending someone to
    // Homebrew for it contradicts the whole premise of a local app that needs no
    // installation — and is impossible advice for the person this hint is most
    // likely to reach, who has no Homebrew.
    setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)');
    expect(ghostscriptHint()).not.toMatch(/brew/i);
  });

  it('[DEP-01f] tells the macOS user the one thing that can actually fix it', () => {
    // Reachable only when the bundled binary failed to start, since detection
    // tries the sidecar before anything else. Reinstalling restores it.
    setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)');
    expect(ghostscriptHint()).toMatch(/reinstall/i);
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
