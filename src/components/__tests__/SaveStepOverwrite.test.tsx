// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { writeFile, exists } from '@tauri-apps/plugin-fs';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { SaveStep } from '@/components/SaveStep';

// ─── Folder save must not destroy existing files (BATCH-02) ──────────────────
//
// Regression test for a live bug: the folder-save loop wrote each output
// straight to `${folder}/${fileName}` with no existence check. Splitting the
// same PDF into the same folder twice silently destroyed the first set. This
// would have caught it.

vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn(), save: vi.fn() }));
vi.mock('@tauri-apps/plugin-shell', () => ({ open: vi.fn() }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

const outputs = [
  { fileName: 'scan-1.pdf', bytes: new Uint8Array([1]) },
  { fileName: 'scan-2.pdf', bytes: new Uint8Array([2]) },
];

function renderSaveStep() {
  return render(
    <SaveStep
      processedBytes={new Uint8Array([0])}
      sourceFileName="scan.pdf"
      multiFileOutputs={outputs}
      onSaveComplete={vi.fn()}
      onCancel={vi.fn()}
      onBack={vi.fn()}
    />,
  );
}

async function saveToFolder(user: ReturnType<typeof userEvent.setup>) {
  // "Save to Folder" is the (default) radio mode; the action is the Save button.
  await user.click(await screen.findByRole('button', { name: /^save$/i }));
  await act(async () => {});
}

afterEach(cleanup);
beforeEach(() => {
  vi.mocked(writeFile).mockReset().mockResolvedValue(undefined);
  vi.mocked(exists).mockReset().mockResolvedValue(false);
  vi.mocked(openDialog).mockReset().mockResolvedValue('/out');
});

describe('folder save', () => {
  it('[BATCH-02a] writes each file under its own name when the folder is empty', async () => {
    const user = userEvent.setup();
    renderSaveStep();
    await saveToFolder(user);

    // Only the writes that landed in the chosen folder. Asserting on every
    // writeFile call ever made couples this to unrelated writes elsewhere in the
    // app, which is exactly what it should not care about.
    const written = vi.mocked(writeFile).mock.calls
      .map((c) => c[0] as string)
      .filter((p) => typeof p === 'string' && p.startsWith('/out/'));
    expect(written).toEqual(['/out/scan-1.pdf', '/out/scan-2.pdf']);
  });

  it('[BATCH-02b] never writes over a file that is already there', async () => {
    // scan-1.pdf already exists from an earlier run.
    vi.mocked(exists).mockImplementation(async (p) => p === '/out/scan-1.pdf');
    const user = userEvent.setup();
    renderSaveStep();
    await saveToFolder(user);

    // Only the writes that landed in the chosen folder. Asserting on every
    // writeFile call ever made couples this to unrelated writes elsewhere in the
    // app, which is exactly what it should not care about.
    const written = vi.mocked(writeFile).mock.calls
      .map((c) => c[0] as string)
      .filter((p) => typeof p === 'string' && p.startsWith('/out/'));
    expect(written).not.toContain('/out/scan-1.pdf');
    expect(written).toEqual(['/out/scan-1 (2).pdf', '/out/scan-2.pdf']);
  });
});
