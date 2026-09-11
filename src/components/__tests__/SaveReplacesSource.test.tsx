// @vitest-environment jsdom
import { useState } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { writeFile } from '@tauri-apps/plugin-fs';
import { save as saveDialog } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { SaveStep } from '@/components/SaveStep';

/**
 * [SAVE-02] Save replaces the file it was given; Save as… writes a copy.
 *
 * Reported after the whole tool set was tried on Linux: the app held two
 * opposite ideas of what Save means. The PDF editor overwrote the file it had
 * opened, with no dialog. All twenty tool flows always opened a Save As dialog
 * with a new suggested name, so unlocking a PDF left the locked one in place
 * and added `report-unlocked.pdf` beside it — the user had asked to unlock
 * their document and got a second document instead.
 *
 * Save now means what it means everywhere else on a desktop: the same file,
 * changed. Save as… is how a copy gets made.
 *
 * Two kinds of flow cannot do this and keep the dialog:
 *   - the output is a different file type (a .docx cannot replace a .pdf)
 *   - the count changes (Merge takes many, Split produces many)
 * and Protect is a deliberate third case — see SAVE-02f.
 */

vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn(), save: vi.fn() }));
vi.mock('@tauri-apps/plugin-shell', () => ({ open: vi.fn() }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

const BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

/**
 * Replacing the source does not go through `writeFile`.
 *
 * The plugin opens with O_TRUNC, so the user's only copy is zero bytes from the
 * moment the file opens until the last byte lands. Save goes through the
 * `save_over_file` command, which writes a sibling temporary file and renames
 * it over the target. See FP-00 in SaveFilePermissions.test.tsx.
 */
function expectReplaced(path: string) {
  expect(vi.mocked(invoke)).toHaveBeenCalledWith(
    'save_over_file',
    BYTES,
    { headers: { path: encodeURIComponent(path) } },
  );
}

function renderSaveStep(sourcePath: string | null) {
  return render(
    <SaveStep
      processedBytes={BYTES}
      sourceFileName="report.pdf"
      sourcePath={sourcePath}
      onSaveComplete={vi.fn()}
      onCancel={vi.fn()}
      onBack={vi.fn()}
    />,
  );
}

beforeEach(() => {
  vi.mocked(writeFile).mockClear();
  vi.mocked(saveDialog).mockClear();
  vi.mocked(invoke).mockReset().mockResolvedValue(undefined);
});
afterEach(cleanup);

describe('Save replaces the source file', () => {
  it('[SAVE-02a] does not open a dialog when it can replace the file', async () => {
    // Arriving at this step used to fire the OS Save As dialog immediately, so
    // there was no way to save without naming a new file.
    renderSaveStep('/docs/report.pdf');

    await screen.findByRole('button', { name: /^save$/i });
    expect(vi.mocked(saveDialog)).not.toHaveBeenCalled();
  });

  it('[SAVE-02b] Save writes back to the file it was given', async () => {
    const user = userEvent.setup();
    renderSaveStep('/docs/report.pdf');

    await user.click(await screen.findByRole('button', { name: /^save$/i }));

    await waitFor(() => expectReplaced('/docs/report.pdf'));
    expect(vi.mocked(saveDialog), 'Save must not ask where to put it').not.toHaveBeenCalled();
  });

  it('[SAVE-02c] Save as… still writes a copy wherever the user chooses', async () => {
    const user = userEvent.setup();
    vi.mocked(saveDialog).mockResolvedValueOnce('/docs/elsewhere.pdf');
    renderSaveStep('/docs/report.pdf');

    await user.click(await screen.findByRole('button', { name: /save as/i }));

    await waitFor(() => {
      expect(vi.mocked(writeFile)).toHaveBeenCalledWith('/docs/elsewhere.pdf', BYTES);
    });
  });

  it('[SAVE-02d] a flow with no source file behaves exactly as before', async () => {
    // Convert Document, PDF to JPG and the rest produce a different file type,
    // so there is nothing to replace and the dialog must still open by itself.
    vi.mocked(saveDialog).mockResolvedValueOnce(null);
    renderSaveStep(null);

    await waitFor(() => expect(vi.mocked(saveDialog)).toHaveBeenCalled());
  });
});

// ── The flows, enumerated from source ────────────────────────────────────────

/**
 * Flows that take one file and return one of the same type.
 *
 * Compress PDF and Compress Image are not here: they have no flow directory and
 * are rendered from App.tsx, which SAVE-02g covers instead.
 */
const REPLACES = [
  'rotate', 'crop-pdf', 'watermark', 'page-numbers',
  'redact-pdf', 'sign-pdf', 'organize-pdf', 'repair-pdf',
  'ocr-pdf', 'rotate-image',
];

/** Flows that cannot replace anything, each for a stated reason. */
const CANNOT_REPLACE: Record<string, string> = {
  'convert-doc': 'the output is a different file type',
  'convert-image': 'the output is a different file type',
  'pdf-to-jpg': 'the output is a different file type, and there are many',
  'jpg-to-pdf': 'the output is a different file type',
  merge: 'many files in, one out — there is no single source to replace',
  split: 'one file in, many out',
};

function flowSources(): Map<string, string> {
  const found = new Map<string, string>();
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (entry !== '__tests__') walk(full);
      } else if (entry.endsWith('Flow.tsx')) {
        found.set(full, readFileSync(full, 'utf8'));
      }
    }
  };
  walk('src/components');
  return found;
}

describe('Every flow that can replace its source does', () => {
  it('[SAVE-02e] each same-type flow hands SaveStep the file it opened', () => {
    // Nothing in the type system connects twenty flows to one shared component,
    // so the next tool anyone adds would quietly keep the old behaviour.
    const sources = flowSources();
    const missing: string[] = [];

    for (const dir of REPLACES) {
      const entry = [...sources].find(([path]) => path.includes(`/${dir}/`));
      expect(entry, `no flow file found for ${dir}`).toBeDefined();
      if (!/sourcePath=\{/.test(entry![1])) missing.push(dir);
    }

    expect(missing, 'these flows still write a copy instead of saving').toEqual([]);
  });

  it('[SAVE-02f] the flows that keep the dialog are the ones that must', () => {
    const sources = flowSources();

    for (const [dir, reason] of Object.entries(CANNOT_REPLACE)) {
      const entry = [...sources].find(([path]) => path.includes(`/${dir}/`));
      if (!entry) continue;
      expect(
        /sourcePath=\{/.test(entry[1]),
        `${dir} passes sourcePath, but ${reason}`,
      ).toBe(false);
    }
  });

  it('[SAVE-02g] the two Compress steps in App.tsx replace their source too', () => {
    // Compress PDF and Compress Image have no flow directory of their own; they
    // are rendered inline from App.tsx, so the enumeration above cannot see them
    // and they would have been the two tools quietly left behind.
    const app = readFileSync('src/App.tsx', 'utf8');
    const uses = app.split('<SaveStep');

    // The batch step is genuinely multi-file and keeps the folder/ZIP save.
    const singleFile = uses.slice(1).filter((u) => !u.includes('multiFileOutputs='));
    expect(singleFile.length, 'expected the PDF and image compress save steps').toBe(2);

    for (const use of singleFile) {
      expect(/sourcePath=\{/.test(use), 'a Compress save step still writes a copy').toBe(true);
    }
  });
});

describe('Save Again repeats the choice that was made', () => {
  it('[SAVE-02h] after Save as..., Save Again writes the copy, not the original', async () => {
    // Reported from a real build, in Compress PDF: pick Save as..., name the
    // copy, and it is written correctly. Then press Save Again on the
    // confirmation card and it silently overwrites the ORIGINAL instead.
    //
    // The card's button was wired `canReplace ? handleReplace : handleSave`,
    // which asks whether replacing is *possible* and never whether the user
    // had just declined it. Choosing Save as... is exactly the choice to leave
    // the original alone, so repeating the save must not touch it.
    const user = userEvent.setup();
    const COPY = '/docs/report-compressed.pdf';
    vi.mocked(saveDialog).mockResolvedValue(COPY);

    // The parent owns savedFilePath and sets it when a save completes, which is
    // what brings up the confirmation card carrying Save Again.
    function Harness() {
      const [savedFilePath, setSavedFilePath] = useState<string | null>(null);
      return (
        <SaveStep
          processedBytes={BYTES}
          sourceFileName="report.pdf"
          sourcePath="/docs/report.pdf"
          savedFilePath={savedFilePath}
          onDismissSaveConfirmation={() => setSavedFilePath(null)}
          onSaveComplete={(p) => setSavedFilePath(p)}
          onCancel={vi.fn()}
          onBack={vi.fn()}
        />
      );
    }
    render(<Harness />);

    await user.click(await screen.findByRole('button', { name: /save as/i }));
    await waitFor(() => {
      expect(vi.mocked(writeFile)).toHaveBeenCalledWith(COPY, BYTES);
    });

    vi.mocked(writeFile).mockClear();
    vi.mocked(saveDialog).mockClear();

    await user.click(await screen.findByRole('button', { name: /save a copy/i }));

    await waitFor(() => {
      expect(vi.mocked(writeFile)).toHaveBeenCalled();
    });
    const targets = vi.mocked(writeFile).mock.calls.map((c) => c[0]);
    expect(targets, 'Save Again overwrote the original the user chose to keep')
      .not.toContain('/docs/report.pdf');
    expect(vi.mocked(saveDialog), 'it should ask again where to put the copy')
      .toHaveBeenCalled();
  });

  it('[SAVE-02i] after a plain Save there is nothing left to save, and it says so', async () => {
    // This used to offer "Save Again", which re-wrote the same bytes to the same
    // path: a no-op the user could not tell from a broken button. The two ways
    // of saving end in genuinely different places, so they end with different
    // controls -- a replace is finished, a Save as can take another copy.
    const user = userEvent.setup();

    function Harness() {
      const [savedFilePath, setSavedFilePath] = useState<string | null>(null);
      return (
        <SaveStep
          processedBytes={BYTES}
          sourceFileName="report.pdf"
          sourcePath="/docs/report.pdf"
          savedFilePath={savedFilePath}
          onDismissSaveConfirmation={() => setSavedFilePath(null)}
          onSaveComplete={(p) => setSavedFilePath(p)}
          onCancel={vi.fn()}
          onBack={vi.fn()}
        />
      );
    }
    render(<Harness />);

    await user.click(await screen.findByRole('button', { name: /^save$/i }));
    await waitFor(() => expect(vi.mocked(invoke)).toHaveBeenCalled());

    const button = await screen.findByTestId('save-again-btn');
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent(/saved/i);
  });
});
