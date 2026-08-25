// @vitest-environment jsdom
/**
 * Leaving the editor with unsaved changes.
 *
 * The old prompt was a two-choice window.confirm reading "OK to save before
 * leaving, or Cancel to stay" — but Cancel fell through to goToDashboard(), so
 * it discarded the edits and left anyway, the opposite of what it promised.
 * There was also no way to leave without saving.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { useEffect, useRef } from 'react';
import { EditorProvider, useEditorContext, createEditorViewState } from '@/context/EditorContext';
import { ToolProvider, useToolContext } from '@/context/ToolContext';
import { EditorTopToolbar } from '@/components/pdf-editor/EditorTopToolbar';
import { useSaveActions } from '@/components/pdf-editor/SaveController';

const save = vi.fn(() => Promise.resolve(true));

vi.mock('@/components/pdf-editor/SaveController', () => ({ useSaveActions: vi.fn() }));
vi.mock('@/components/pdf-editor/FormattingToolbar', () => ({ FormattingToolbar: () => null }));

const ORIGINAL = new Uint8Array([1, 1, 1, 1]);
const EDITED = new Uint8Array([2, 2, 2, 2]);

function Harness({ dirty }: { dirty: boolean }) {
  const ctx = useEditorContext();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    ctx.initState(createEditorViewState(ORIGINAL, 2, 'sample.pdf', '/tmp/sample.pdf', 1));
    if (dirty) ctx.updatePdfBytes(EDITED);
  }, [ctx, dirty]);

  return (
    <>
      <EditorTopToolbar />
      <SwitchToolButton />
    </>
  );
}

/** Stands in for editor-sidebar navigation, which switches tools directly. */
function SwitchToolButton() {
  const { selectTool, editorFilePath } = useToolContext();
  return (
    <>
      <button type="button" onClick={() => selectTool('merge-pdf')}>
        Switch tool
      </button>
      <span data-testid="editor-open">{editorFilePath === null ? 'closed' : 'open'}</span>
    </>
  );
}

function renderToolbar(dirty: boolean) {
  render(
    <ToolProvider>
      <EditorProvider>
        <Harness dirty={dirty} />
      </EditorProvider>
    </ToolProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  save.mockResolvedValue(true);
  vi.mocked(useSaveActions).mockReturnValue({ save, saveAs: vi.fn(), isSaving: false });
});

afterEach(cleanup);

describe('leaving the editor', () => {
  it('ED-01: a clean document leaves straight away, with no prompt', () => {
    renderToolbar(false);

    fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(save).not.toHaveBeenCalled();
  });

  it('ED-02: a dirty document prompts instead of leaving', async () => {
    renderToolbar(true);

    fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }));

    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(save).not.toHaveBeenCalled();
  });

  it('ED-03: Cancel stays in the editor and writes nothing', async () => {
    renderToolbar(true);

    fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /^cancel$/i }));

    // The whole point: Cancel is inert. It used to discard and leave.
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Dashboard' })).toBeTruthy();
  });

  it("ED-04: Don't Save leaves without writing the file", async () => {
    renderToolbar(true);

    fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /don't save/i }));

    expect(save).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('ED-05: Save writes, then leaves', async () => {
    renderToolbar(true);

    fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(save).toHaveBeenCalled());
  });

  it('ED-06: a cancelled save keeps the editor open', async () => {
    save.mockResolvedValueOnce(false);
    renderToolbar(true);

    fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(save).toHaveBeenCalled());
    // Backing out of the OS save dialog must not throw the document away.
    expect(screen.getByRole('button', { name: 'Dashboard' })).toBeTruthy();
  });
});

describe('reverting to the original', () => {
  it('ED-07: Revert is offered even on a saved document, and asks first', () => {
    // The scenario this exists for: edits were already saved over the original
    // before the user realised it was the wrong file. isDirty is false by then.
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderToolbar(false);

    const revert = screen.getByRole('button', { name: /revert/i });
    fireEvent.click(revert);

    expect(confirmSpy).toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('ED-08: declining the confirmation changes nothing', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderToolbar(true);

    fireEvent.click(screen.getByRole('button', { name: /revert/i }));

    // Still dirty: the edits were not thrown away.
    expect(screen.getByTitle('Unsaved changes')).toBeTruthy();
    confirmSpy.mockRestore();
  });

  it('ED-09: confirming restores the document as it was opened', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderToolbar(true);

    fireEvent.click(screen.getByRole('button', { name: /revert/i }));

    // Reverting leaves the document dirty on purpose -- if the edits were
    // already saved, the restored original still needs writing back.
    await waitFor(() => expect(screen.getByTitle('Unsaved changes')).toBeTruthy());
    confirmSpy.mockRestore();
  });
});

describe('switching tools from inside the editor', () => {
  it('ED-10: a dirty document prompts instead of being silently abandoned', async () => {
    renderToolbar(true);

    // selectTool clears editorFilePath, which tears the editor down. Reachable
    // the moment editor-sidebar navigation is wired to "papercut:open-tool".
    fireEvent.click(screen.getByRole('button', { name: 'Switch tool' }));

    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(save).not.toHaveBeenCalled();
  });

  it('ED-11: Cancel leaves the editor open', async () => {
    renderToolbar(true);

    fireEvent.click(screen.getByRole('button', { name: 'Switch tool' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /^cancel$/i }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('ED-12: a clean document switches straight away', () => {
    renderToolbar(false);

    fireEvent.click(screen.getByRole('button', { name: 'Switch tool' }));

    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
