/**
 * Which specs can mean anything on the machine currently running them.
 *
 * Several of this app's capabilities are genuinely platform-bound, and a suite
 * that fails on Linux for OCR — a feature the platform gate deliberately hides
 * there — teaches nothing and trains people to ignore red. These skip instead,
 * and the run report records what was skipped and why, so a green run is never
 * mistaken for full coverage.
 */
export type Platform = 'macos' | 'linux' | 'windows';

export function currentPlatform(): Platform {
  if (process.platform === 'darwin') return 'macos';
  if (process.platform === 'win32') return 'windows';
  return 'linux';
}

/** Recorded by the reporter, so the summary can say what did not run. */
export const skipped: Array<{ spec: string; reason: string }> = [];

/**
 * Skip the surrounding test unless the platform is one of `platforms`.
 *
 * Call at the top of an `it`. Mocha's `this.skip()` needs a non-arrow function,
 * which is why these take the context explicitly.
 */
export function requirePlatform(
  ctx: Mocha.Context,
  platforms: Platform[],
  reason: string,
): boolean {
  const here = currentPlatform();
  if (platforms.includes(here)) return true;
  skipped.push({ spec: ctx.test?.title ?? 'unknown', reason: `${reason} (on ${here})` });
  ctx.skip();
  return false;
}

/**
 * Unix file modes are what FP-01 and FP-04 are about, and Windows does not have
 * them: a read-only flag there is an attribute with different semantics, so the
 * test would be asserting something it was not written for.
 */
export function requiresUnixPermissions(ctx: Mocha.Context): boolean {
  return requirePlatform(ctx, ['macos', 'linux'], 'needs POSIX file modes');
}
