/**
 * HTML-SCRIPTS — an HTML file's own JavaScript never runs during HTML → PDF.
 *
 * The macOS engine renders the file in a hidden WKWebView. A saved web page is
 * still a web page: its scripts could rewrite what lands in the PDF, or probe
 * the local files the webview is allowed to read. S2 turned page JavaScript
 * off (`allowsContentJavaScript = false`); the app's own measuring script runs
 * through evaluateJavaScript, which that flag does not cover.
 *
 * The fixture's script replaces the whole body. If it runs, the PDF says so.
 */
import { browser, expect } from '@wdio/globals';
import { mockOpenDialog, mockSaveDialog } from '../../helpers/dialogs';
import { goToToolById, completeSave, captureFailure, prepareOutputPath } from '../../helpers/driver';
import { clickTestId, getTestIdAttr, waitForTestId, waitForStep } from '../../helpers/testid';
import { Workspace } from '../../helpers/workspace';
import { requirePlatform } from '../../helpers/platform';
import { pdfText } from '../../helpers/verify';

const ws = new Workspace('html-scripts');

after(() => ws.cleanup());

afterEach(async function (this: Mocha.Context) {
  if (this.currentTest?.state === 'failed') {
    await captureFailure(browser, this.currentTest.fullTitle());
  }
});

const HTML = `<!doctype html>
<html><head><meta charset="utf-8"><title>scripts</title></head>
<body>
<p>STATIC-MARKER</p>
<script>document.body.innerHTML = '<p>SCRIPT-RAN</p>';</script>
</body></html>`;

describe('HTML to PDF ignores the page\'s own scripts', () => {
  it('[E2E-HTML-SCRIPTS] a script in the HTML does not change the PDF', async function () {
    if (!requirePlatform(this, ['macos'], 'the webview HTML engine is macOS-only')) return;

    const source = ws.write('scripted.html', HTML);
    const outPath = prepareOutputPath('html-scripts.pdf');

    await goToToolById(browser, 'convert-doc');
    await waitForTestId(browser, 'open-file-btn');
    await mockOpenDialog(browser, source);
    await clickTestId(browser, 'open-file-btn');
    await waitForStep(browser, 1);

    await (await browser.$('button=PDF')).click();
    // Disabled until converter detection settles; a click before that is lost.
    await waitForTestId(browser, 'apply-btn');
    await browser.waitUntil(
      async () => getTestIdAttr(browser, 'apply-btn', 'disabled').then((d) => d === null),
      { timeout: 30000, timeoutMsg: 'Convert never became enabled' },
    );
    await clickTestId(browser, 'apply-btn');
    await waitForStep(browser, 2);

    await mockSaveDialog(browser, outPath);
    await clickTestId(browser, 'save-btn');
    await completeSave(browser, outPath);

    const text = await pdfText(outPath);
    expect(text).toContain('STATIC-MARKER');
    expect(text).not.toContain('SCRIPT-RAN');
  });
});
