// @vitest-environment jsdom
import { StrictMode } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/react';
import { save as saveDialog } from '@tauri-apps/plugin-dialog';
import { SaveStep } from '@/components/SaveStep';

/**
 * [SAVE-ONCE] Arriving at the save step opens one dialog, not two.
 *
 * Reported from a real Ubuntu build: Convert Image → Save put two identical save
 * dialogs on screen, stacked.
 *
 * `SaveStep` fires `handleSave()` from a mount effect whenever the flow has no
 * source file to replace, and React StrictMode mounts, unmounts and mounts
 * again — so the effect runs twice. Nothing stopped the second run: the
 * `saveState` it sets is React state, which has not re-rendered by the time the
 * second invocation happens, so it cannot act as a guard.
 *
 * macOS hid it. Its save panel is app-modal, so the second `save()` waits behind
 * the first and looks like one dialog. GTK's portal opens each one in its own
 * window, so on Linux you see both.
 *
 * Seven flows reach this path — Convert Image, Convert Document, Edit PDF,
 * JPG to PDF, Merge, PDF to JPG and Split — so it is pinned on SaveStep itself
 * rather than on the tool that happened to report it.
 */

vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn(), save: vi.fn() }));
vi.mock('@tauri-apps/plugin-shell', () => ({ open: vi.fn() }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

const BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

beforeEach(() => {
  vi.mocked(saveDialog).mockReset();
  // A dialog that never resolves: the real one stays open until the user acts,
  // and resolving it immediately would let the first call finish and mask a
  // second one that is genuinely concurrent.
  vi.mocked(saveDialog).mockReturnValue(new Promise(() => {}));
});
afterEach(cleanup);

describe('The save dialog opens once', () => {
  it('[SAVE-ONCE-01] a flow with no file to replace opens exactly one dialog under StrictMode', async () => {
    render(
      <StrictMode>
        <SaveStep
          processedBytes={BYTES}
          sourceFileName="photo.png"
          onSaveComplete={vi.fn()}
          onCancel={vi.fn()}
          onBack={vi.fn()}
        />
      </StrictMode>,
    );

    await waitFor(() => expect(vi.mocked(saveDialog)).toHaveBeenCalled());
    expect(
      vi.mocked(saveDialog),
      'two stacked OS save dialogs is what the Ubuntu build showed',
    ).toHaveBeenCalledTimes(1);
  });

  it('[SAVE-ONCE-02] a flow that can replace its file still opens no dialog at all', async () => {
    // The other half of the guard: it must not suppress the dialog for the
    // flows that are supposed to have one, nor introduce one where Save
    // replaces the original.
    render(
      <StrictMode>
        <SaveStep
          processedBytes={BYTES}
          sourceFileName="report.pdf"
          sourcePath="/docs/report.pdf"
          onSaveComplete={vi.fn()}
          onCancel={vi.fn()}
          onBack={vi.fn()}
        />
      </StrictMode>,
    );

    await new Promise((r) => setTimeout(r, 0));
    expect(vi.mocked(saveDialog)).not.toHaveBeenCalled();
  });
});
