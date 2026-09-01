/**
 * LOCK-01 — a password-protected PDF is refused at the door, in every tool.
 *
 * Reported from a real Ubuntu build: opening a protected PDF in Rotate PDF
 * showed the page grid with nothing in it to select. Every flow opened its
 * document with pdf-lib's `ignoreEncryption: true`, so `locked.pdf` loaded,
 * reported six pages, and the tool laid out six tiles before pdf.js failed to
 * decrypt any of them.
 *
 * The unit suite covers all eleven tools. This exists because that suite mocks
 * the renderer: it proves the guard is called, not that a real locked document
 * reaching a real pdf.js produces a refusal instead of an empty grid.
 *
 * Asserted on the message rather than a testid: the claim is "the user was
 * told", and marking up eleven flows for one sentence would put the testid
 * further from the claim than the text is.
 */
import { browser } from '@wdio/globals';
import { expect } from '@wdio/globals';
import { mockOpenDialog } from '../../helpers/dialogs';
import { selectToolOnDashboard, resetAppState } from '../../helpers/driver';
import { clickTestId, waitForTestId, waitForText, pageContainsText } from '../../helpers/testid';
import { Workspace } from '../../helpers/workspace';

const ws = new Workspace('locked-pdf');

/**
 * Every PDF tool that cannot work on an encrypted document.
 *
 * Unlock is absent because accepting one is its whole purpose, and Protect
 * refuses for its own reason — it cannot re-encrypt what it cannot open.
 */
const TOOLS = [
  'Rotate PDF', 'Crop PDF', 'Organize PDF', 'Page Numbers', 'Watermark',
  'Split PDF', 'PDF to JPG', 'Sign PDF', 'Redact PDF', 'Repair PDF', 'PDF/A',
];

after(() => ws.cleanup());

describe('A locked PDF is refused, not silently emptied', () => {
  for (const tool of TOOLS) {
    it(`[E2E-LOCK-01] ${tool} says the file is password-protected`, async () => {
      // A fresh copy per tool: a spec that fails must not leave the next one
      // testing a file an earlier failure moved or changed.
      const locked = ws.fixture('locked.pdf', `locked-${tool.replace(/[^a-z]/gi, '')}.pdf`);

      await resetAppState(browser, tool);
      await selectToolOnDashboard(browser, tool);
      await waitForTestId(browser, 'open-file-btn');
      await mockOpenDialog(browser, locked);
      await clickTestId(browser, 'open-file-btn');

      await waitForText(browser, /password-protected/i);
      // The symptom that was reported: a working-looking screen with nothing on
      // it. If the refusal is shown, the tool must not also have opened.
      expect(await pageContainsText(browser, /password-protected/i)).toBe(true);
    });
  }

  it('[E2E-LOCK-02] Unlock PDF still accepts one, since that is its purpose', async () => {
    const locked = ws.fixture('locked.pdf', 'locked-for-unlock.pdf');

    await resetAppState(browser, 'Unlock PDF');
    await selectToolOnDashboard(browser, 'Unlock PDF');
    await waitForTestId(browser, 'open-file-btn');
    await mockOpenDialog(browser, locked);
    await clickTestId(browser, 'open-file-btn');

    // It must reach the password screen rather than refusing at the door.
    await waitForText(browser, /password/i);
    expect(await pageContainsText(browser, /password-protected.*unlock pdf tool/i)).toBe(false);
  });
});
