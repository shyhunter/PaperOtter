/**
 * [PLATFORM] What the app says differently depending on the operating system.
 *
 * Papercut ships for macOS, Windows and Linux, and a handful of strings and
 * gates change with the platform. Those are easy to get wrong and hard to
 * notice, because whoever is looking at the screen only ever sees one of the
 * three: the reveal button said **Finder** on every platform once, and a Linux
 * user was told to look in an application that does not exist there.
 *
 * `currentPlatform()` reads `navigator.userAgent`, so a browser context is the
 * entire apparatus needed to ask "what would a Windows user see?" — no Windows
 * machine, no CI runner, no installer. That is the whole reason these live here
 * rather than on a manual pass sheet.
 *
 * **What this does NOT cover, and must not be mistaken for:** anything compiled.
 * The Rust commands, the statically linked qpdf, the MSVC build and the
 * installer are all invisible from a browser, and no test in this file says
 * anything about whether they work on Windows. That question needs a Windows
 * build. This file covers the part of the platform surface that lives in the
 * interface, which is a real part, and only that part.
 */
import { test, expect, type Page } from '@playwright/test';
import { userAgentFor } from './support/platform';
import type { Platform } from '@/lib/platform';
import { bootApp, openToolById, fixtureBytes, HOME } from './support/app';

/** What each platform calls the place a saved file went. */
const REVEAL_LABEL: Record<Platform, string> = {
  macos: 'Show in Finder',
  windows: 'Show in File Explorer',
  linux: 'Show in file manager',
};

/**
 * Take a document all the way through a tool and save it.
 *
 * Rotate is used because it needs nothing but pdf-lib — no sidecar, no canvas —
 * so the run reaches the save confirmation on any platform's user agent without
 * depending on anything a real machine would have to provide.
 */
async function saveThroughRotate(page: Page): Promise<void> {
  const source = `${HOME}/sample.pdf`;
  await bootApp(page, {
    files: { [source]: fixtureBytes('sample.pdf') },
    openQueue: [source],
    saveQueue: [`${HOME}/rotated.pdf`],
  });

  await openToolById(page, 'rotate-pdf');
  await page.getByTestId('open-file-btn').click();
  await page
    .locator('[data-testid="step-bar-item"][data-active="true"][data-step-index="1"]')
    .waitFor();
  await page.getByTestId('rotate-all-right-btn').click();
  await page.getByTestId('apply-btn').click();

  await page.getByTestId('save-as-btn').click();
  await expect(page.getByTestId('save-confirmation')).toBeVisible();
}

for (const platform of ['macos', 'windows', 'linux'] as const) {
  test(`[PLATFORM-01] a ${platform} user is told where the file went in their own words`, async ({
    browser,
  }) => {
    const context = await browser.newContext({
      userAgent: userAgentFor(platform),
      viewport: { width: 900, height: 660 },
    });
    const page = await context.newPage();

    try {
      await saveThroughRotate(page);

      // The assertion the unit test on `revealLabelKey` cannot make: that the
      // rendered save confirmation actually calls it. The defect this guards
      // against was a hardcoded string, which keeps every unit test green.
      await expect(
        page.getByTestId('save-confirmation'),
        `${platform} should offer "${REVEAL_LABEL[platform]}"`,
      ).toContainText(REVEAL_LABEL[platform]);

      // And says nothing about the other two. A label that mentioned Finder on
      // Windows would be exactly the original bug.
      for (const other of ['macos', 'windows', 'linux'] as const) {
        if (other === platform) continue;
        await expect(
          page.getByTestId('save-confirmation'),
          `${platform} must not mention ${other}'s file manager`,
        ).not.toContainText(REVEAL_LABEL[other]);
      }
    } finally {
      await context.close();
    }
  });
}
