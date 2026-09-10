/**
 * TOOL-CONTRACT — every tool opens a document, does its work, and writes a file
 * that is really changed in the way asked.
 *
 * The same skeleton for each tool, so adding one is a table entry rather than a
 * spec. What it proves is deliberately narrow and deliberately not about the
 * screen: a document goes in, the tool's own action runs, a file comes out, and
 * that file is read back **in Node, by pdf-lib and pdf.js** — the app has no say
 * in the verdict. A verifier that asked the app what it had done would agree
 * with the app by construction.
 *
 * Three claims per tool, and the third is the one that matters:
 *   1. the flow reaches Save at all
 *   2. the output is a valid document of the expected shape
 *   3. it DIFFERS from the input
 *
 * Without (3) a tool that quietly hands back its input passes every other check
 * — the file exists, it opens, it has the right number of pages — which is
 * exactly the shape of the bug nobody notices for a year.
 *
 * Tools the platform gate disables here skip with a recorded reason, so a green
 * run is never mistaken for full coverage.
 */
import { browser } from '@wdio/globals';
import { expect } from '@wdio/globals';
import { mockOpenDialog, mockSaveDialog } from '../../helpers/dialogs';
import {
  goToToolById, goToDashboard, toolAvailability, completeSave, captureFailure, prepareOutputPath,
} from '../../helpers/driver';
import { clickTestId, waitForTestId, waitForStep } from '../../helpers/testid';
import { Workspace } from '../../helpers/workspace';
import { skipped } from '../../helpers/platform';
import { pdfFacts, differsFrom } from '../../helpers/verify';

const ws = new Workspace('tool-contract');

after(() => ws.cleanup());

afterEach(async function (this: Mocha.Context) {
  if (this.currentTest?.state === 'failed') {
    await captureFailure(browser, this.currentTest.fullTitle());
  }
});

interface Contract {
  /** Tool id, not display name — the name is copy, the id is an identifier. */
  id: string;
  /** Generated fixture from known.ts, so its properties are known. */
  fixture: string;
  /** Output file name; the extension decides what the save dialog is told. */
  output: string;
  /** The minimal real input the tool needs before its action can run. */
  prepare?: () => Promise<void>;
  /** Read the artefact back and say what must be true of it. */
  verify: (outPath: string, sourcePath: string) => Promise<void>;
}

/** Unchanged page count and page geometry: the usual "did not mangle it" claim. */
async function keepsShape(outPath: string, sourcePath: string): Promise<void> {
  const before = await pdfFacts(sourcePath);
  const after = await pdfFacts(outPath);
  expect(after.pageCount).toBe(before.pageCount);
  expect(after.pageSizes).toEqual(before.pageSizes);
}

const CONTRACTS: Contract[] = [
  {
    id: 'rotate-pdf',
    fixture: 'known-12-a4.pdf',
    output: 'contract-rotate.pdf',
    prepare: async () => { await clickTestId(browser, 'rotate-all-right-btn'); },
    verify: async (outPath, sourcePath) => {
      await keepsShape(outPath, sourcePath);
      const before = await pdfFacts(sourcePath);
      const after = await pdfFacts(outPath);
      // The whole point: turned right by ninety, on every page, from whatever
      // each page already was. A tool that reset every page to 90 instead of
      // adding 90 passes a "rotation is 90" check and fails this one.
      after.rotations.forEach((angle, i) => {
        expect(angle).toBe((before.rotations[i] + 90) % 360);
      });
    },
  },
  {
    id: 'page-numbers',
    fixture: 'known-12-a4.pdf',
    output: 'contract-page-numbers.pdf',
    verify: keepsShape,
  },
  {
    id: 'repair-pdf',
    fixture: 'known-12-a4.pdf',
    output: 'contract-repair.pdf',
    verify: keepsShape,
  },
];

describe('Every tool honours the same contract', () => {
  for (const contract of CONTRACTS) {
    it(`[E2E-CONTRACT] ${contract.id} opens a document, works on it, and writes a changed file`, async function () {
      const state = await (async () => {
        // The dashboard has to be on screen before it can be asked anything.
        await goToToolById(browser, contract.id).catch(() => undefined);
        return toolAvailability(browser, contract.id);
      })().catch(() => 'missing' as const);

      if (state === 'unavailable') {
        skipped.push({
          spec: this.test?.title ?? contract.id,
          reason: 'the platform gate disables this tool on this machine',
        });
        this.skip();
        return;
      }

      const source = ws.known(contract.fixture, `${contract.id}-in.pdf`);
      const outPath = prepareOutputPath(contract.output);

      await goToToolById(browser, contract.id);
      await waitForTestId(browser, 'open-file-btn');
      await mockOpenDialog(browser, source);
      await clickTestId(browser, 'open-file-btn');
      await waitForStep(browser, 1);

      if (contract.prepare) await contract.prepare();

      await waitForTestId(browser, 'apply-btn');
      await clickTestId(browser, 'apply-btn');
      await waitForStep(browser, 2);

      await mockSaveDialog(browser, outPath);
      await completeSave(browser, outPath);

      await contract.verify(outPath, source);

      // Last, and never optional. Everything above is satisfied by a tool that
      // copied its input.
      if (!differsFrom(source, outPath)) {
        throw new Error(`${contract.id} wrote a file byte-identical to its input`);
      }
    });
  }

  it('[E2E-CONTRACT] the contract table names only real tools', async () => {
    // A typo in an id would skip as "missing" and read as a platform gate —
    // a whole tool silently dropping out of the suite while the run stays
    // green. The cards only exist on the dashboard, so ask from there.
    await goToDashboard(browser);
    for (const contract of CONTRACTS) {
      const state = await toolAvailability(browser, contract.id);
      if (state === 'missing') throw new Error(`No tool card with id "${contract.id}"`);
    }
  });
});
