/**
 * Which platform the harness tells the app it is running on.
 *
 * This is not a detail. `currentPlatform()` in `src/lib/platform.ts` reads
 * `navigator.userAgent`, so the user agent decides whether Make Searchable is
 * offered at all and whether the app says Finder, Explorer or Files. Playwright's
 * `devices['Desktop Chrome']` descriptor pins a **Windows** user agent regardless
 * of the host, so until this file existed every browser test — on a Mac and on
 * Linux CI alike — was quietly exercising the Windows rendering of the app, and
 * the OCR tool was absent from the dashboard without anyone having said so.
 *
 * Two things follow, and both are deliberate:
 *
 *   1. The harness **pins** a platform rather than inheriting the host's, so a
 *      run on a Mac and a run on Linux CI render the same app. Inheriting would
 *      make the dashboard's contents differ by machine, which is how a suite
 *      starts passing in one place and failing in another for no stated reason.
 *   2. It pins **macOS**, because that is the only platform where every tool in
 *      the registry exists. Pinning Linux would leave `ocr-pdf` untested by the
 *      contract sweep. Windows and Linux are covered explicitly by the gate test
 *      rather than implicitly by whatever the runner happened to default to.
 *
 * The Chrome version is taken from the installed descriptor rather than written
 * down, so only the platform token differs from the browser actually running.
 */
import { devices } from '@playwright/test';
import type { Platform } from '@/lib/platform';

const CHROME_UA = devices['Desktop Chrome'].userAgent ?? '';

/** The OS token each platform puts in its user agent, as `currentPlatform` reads it. */
const OS_TOKEN: Record<Platform, string> = {
  macos: 'Macintosh; Intel Mac OS X 10_15_7',
  windows: 'Windows NT 10.0; Win64; x64',
  linux: 'X11; Linux x86_64',
};

/** A Chrome user agent for `platform`, matching the browser this run actually uses. */
export function userAgentFor(platform: Platform): string {
  return CHROME_UA.replace(/\(([^)]*)\)/, `(${OS_TOKEN[platform]})`);
}

/** The platform the harness pins. Every spec renders the app as this. */
export const HARNESS_PLATFORM: Platform = 'macos';
