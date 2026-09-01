// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { invoke } from '@tauri-apps/api/core';
import { writeFile } from '@tauri-apps/plugin-fs';
import { save as saveDialog } from '@tauri-apps/plugin-dialog';
import { SaveStep } from '@/components/SaveStep';

/**
 * [FP-01 – FP-04] What Save does when it cannot have the file.
 *
 * These four paths had never been run on any machine. Since PR #85 Save writes
 * back over the document the flow was opened with, so all four land on code
 * that did not exist before, against the user's only copy.
 *
 * The question each asks is not "does it error" but "does the error say what
 * happened". Before this, all four produced the same sentence — "Could not
 * write file. Check that you have permission to write to the selected
 * location." — which named the wrong cause for three of them, and named a
 * location the user had not selected for all four.
 */

vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn(), save: vi.fn() }));
vi.mock('@tauri-apps/plugin-shell', () => ({ open: vi.fn() }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

const BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

function renderSaveStep() {
  return render(
    <SaveStep
      processedBytes={BYTES}
      sourceFileName="payslip.pdf"
      sourcePath="/docs/payslip.pdf"
      onSaveComplete={vi.fn()}
      onCancel={vi.fn()}
      onBack={vi.fn()}
    />,
  );
}

async function clickSave() {
  renderSaveStep();
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: /^save$/i }));
  return user;
}

beforeEach(() => {
  vi.mocked(invoke).mockReset().mockResolvedValue(undefined);
  vi.mocked(writeFile).mockClear();
  vi.mocked(saveDialog).mockClear();
});
afterEach(cleanup);

describe('Save over the source file', () => {
  it('[FP-00] Save goes through the atomic backend, not a truncating write', async () => {
    // tauri-plugin-fs writeFile opens with O_TRUNC, so the original is zero
    // bytes from the moment the file opens until the last byte lands. A half
    // written PDF over someone's only copy is the worst outcome in this app.
    await clickSave();

    await waitFor(() => {
      expect(vi.mocked(invoke)).toHaveBeenCalledWith(
        'save_over_file',
        BYTES,
        { headers: { path: encodeURIComponent('/docs/payslip.pdf') } },
      );
    });
    expect(
      vi.mocked(writeFile),
      'Save must not write over the source through the truncating plugin path',
    ).not.toHaveBeenCalled();
  });

  it('[FP-01] a read-only source is named as read-only', async () => {
    vi.mocked(invoke).mockRejectedValueOnce('READ_ONLY:payslip.pdf');
    await clickSave();

    const message = await screen.findByText(/read-only/i);
    expect(message).toHaveTextContent(/payslip\.pdf/);
    expect(screen.queryByText(/os error/i)).toBeNull();
  });

  it('[FP-02] a source deleted while the tool was open says the work is safe', async () => {
    vi.mocked(invoke).mockRejectedValueOnce('TARGET_GONE:payslip.pdf');
    await clickSave();

    expect(await screen.findByText(/no longer/i)).toHaveTextContent(/payslip\.pdf/);
  });

  it('[FP-02a] and offers Save as… rather than a retry that cannot work', async () => {
    // Retrying a replace against a path that no longer holds the file is the
    // one button that is certain to fail again. The recoverable direction is
    // the dialog.
    vi.mocked(invoke).mockRejectedValueOnce('TARGET_GONE:payslip.pdf');
    await clickSave();

    await screen.findByText(/no longer/i);
    expect(screen.getByRole('button', { name: /save as/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull();
  });

  it('[FP-03] a renamed source reports the same fact as a deleted one', async () => {
    // From the old path's point of view a rename and a delete are the same
    // event, and the backend cannot tell them apart. What must not happen is
    // recreating the old name, which leaves the user holding two files.
    vi.mocked(invoke).mockRejectedValueOnce('TARGET_GONE:payslip.pdf');
    await clickSave();

    await screen.findByText(/no longer/i);
    expect(vi.mocked(writeFile), 'nothing may be written at the old path').not.toHaveBeenCalled();
  });

  it('[FP-04] retry after a permission failure repeats the replace and succeeds', async () => {
    vi.mocked(invoke).mockRejectedValueOnce('READ_ONLY:payslip.pdf');
    const user = await clickSave();

    await screen.findByText(/read-only/i);
    vi.mocked(invoke).mockResolvedValueOnce(undefined);
    await user.click(screen.getByRole('button', { name: /try again/i }));

    await waitFor(() => {
      expect(vi.mocked(invoke).mock.calls.filter((c) => c[0] === 'save_over_file')).toHaveLength(2);
    });
    expect(
      vi.mocked(saveDialog),
      'a retry after a permission failure must not silently become a Save as…',
    ).not.toHaveBeenCalled();
  });

  it('[FP-05] a full disk is not blamed on permissions', async () => {
    vi.mocked(invoke).mockRejectedValueOnce('DISK_FULL:payslip.pdf');
    await clickSave();

    const message = await screen.findByText(/space/i);
    expect(message).toBeInTheDocument();
    expect(screen.queryByText(/permission/i)).toBeNull();
  });
});

// ─── SAVE-DIR-07..09 — Save as… opens where the document came from ───────────
describe('Where Save as… starts', () => {
  it('[SAVE-DIR-07] suggests the folder the document was opened from', async () => {
    // Before this, defaultPath was a bare filename and the dialog decided the
    // folder for itself. On macOS that is the last-used one, which usually
    // looks right; on Linux it can be the process working directory, which
    // under `tauri dev` is inside the project.
    vi.mocked(saveDialog).mockResolvedValueOnce(null);
    render(
      <SaveStep
        processedBytes={BYTES}
        sourceFileName="payslip.pdf"
        sourcePath="/home/me/qa/payslip.pdf"
        onSaveComplete={vi.fn()}
        onCancel={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /save as/i }));

    await waitFor(() => expect(vi.mocked(saveDialog)).toHaveBeenCalled());
    const options = vi.mocked(saveDialog).mock.calls[0][0] as { defaultPath?: string };
    expect(options.defaultPath).toBe('/home/me/qa/payslip-optimised.pdf');
  });

  it('[SAVE-DIR-08] a flow with no source path still suggests a name', async () => {
    // Convert and merge change the type or the count, so they pass no source
    // path. They keep the old behaviour rather than inventing a folder.
    vi.mocked(saveDialog).mockResolvedValueOnce(null);
    render(
      <SaveStep
        processedBytes={BYTES}
        sourceFileName="report.pdf"
        defaultSaveName="report-converted.docx"
        onSaveComplete={vi.fn()}
        onCancel={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    await waitFor(() => expect(vi.mocked(saveDialog)).toHaveBeenCalled());
    const options = vi.mocked(saveDialog).mock.calls[0][0] as { defaultPath?: string };
    expect(options.defaultPath).toBe('report-converted.docx');
  });

  it('[SAVE-DIR-09] a flow that cannot replace still starts where the file came from', async () => {
    // Convert changes the type and Merge changes the count, so neither can
    // replace its source -- but both know where it was, and that is still where
    // the copy belongs.
    vi.mocked(saveDialog).mockResolvedValueOnce(null);
    render(
      <SaveStep
        processedBytes={BYTES}
        sourceFileName="report.pdf"
        defaultSaveName="report.docx"
        originPath="/home/me/qa/report.pdf"
        onSaveComplete={vi.fn()}
        onCancel={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    await waitFor(() => expect(vi.mocked(saveDialog)).toHaveBeenCalled());
    const options = vi.mocked(saveDialog).mock.calls[0][0] as { defaultPath?: string };
    expect(options.defaultPath).toBe('/home/me/qa/report.docx');
  });
});
