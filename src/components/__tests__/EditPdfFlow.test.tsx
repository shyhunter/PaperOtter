// @vitest-environment jsdom
// Tests for EditPdfFlow — unsaved-changes guard (onIsDirtyChange callback).
// Validates that the component correctly reports dirty state to its parent so
// the parent can show a confirmation dialog before navigating to the dashboard.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { EditPdfFlow } from '@/components/edit-pdf/EditPdfFlow';
import type { EditorState } from '@/types/editor';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// ─── Module-level mocks ───────────────────────────────────────────────────────

// Mock pdf-lib's PDFDocument so loadFile doesn't need real PDF bytes.
vi.mock('pdf-lib', () => ({
  PDFDocument: {
    load: vi.fn().mockResolvedValue({
      getPageCount: vi.fn().mockReturnValue(1),
    }),
  },
}));

// EditorLayout is heavy (PDF rendering + canvas) — replace with a lightweight stub
// that exposes a button to trigger an editorState change (simulating user edits).
vi.mock('@/components/edit-pdf/EditorLayout', () => ({
  EditorLayout: vi.fn(
    ({ onEditorStateChange }: { onEditorStateChange: (s: EditorState) => void }) => (
      <div data-testid="editor-layout">
        <button
          type="button"
          data-testid="make-dirty-btn"
          onClick={() =>
            onEditorStateChange({
              pdfBytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
              pages: [],
              currentPage: 0,
              isDirty: true,
            })
          }
        >
          Make Dirty
        </button>
      </div>
    ),
  ),
}));

// SaveStep — not exercised in these tests.
vi.mock('@/components/SaveStep', () => ({
  SaveStep: vi.fn(() => <div data-testid="save-step" />),
}));

// StepErrorBoundary — pass children through to keep tests simple.
vi.mock('@/components/ErrorBoundary', () => ({
  StepErrorBoundary: vi.fn(({ children }: { children: React.ReactNode }) => <>{children}</>),
}));

// ToolContext — provide a pending file so EditPdfFlow auto-loads and advances to step 1.
vi.mock('@/context/ToolContext', () => ({
  useToolContext: vi.fn(() => ({
    pendingFiles: ['/tmp/test.pdf'],
    setPendingFiles: vi.fn(),
  })),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Renders EditPdfFlow and waits for it to reach step 1 (edit mode). */
async function renderAtEditStep(onIsDirtyChange?: (isDirty: boolean) => void) {
  let utils: ReturnType<typeof render>;
  await act(async () => {
    utils = render(
      <EditPdfFlow onStepChange={vi.fn()} onIsDirtyChange={onIsDirtyChange} />,
    );
  });

  // Wait for the async loadFile to complete and EditorLayout to appear
  await screen.findByTestId('editor-layout', {}, { timeout: 5000 });

  return utils!;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('EditPdfFlow — onIsDirtyChange callback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('EPF-01: reports isDirty=false on initial load (no edits yet)', async () => {
    const onIsDirtyChange = vi.fn();
    await renderAtEditStep(onIsDirtyChange);

    // Initial editorState.isDirty is false — callback should have been called with false
    expect(onIsDirtyChange).toHaveBeenCalledWith(false);
    // Should NOT have been called with true at this point
    expect(onIsDirtyChange).not.toHaveBeenCalledWith(true);
  });

  it('EPF-02: reports isDirty=true when the editor reports unsaved changes', async () => {
    const onIsDirtyChange = vi.fn();
    await renderAtEditStep(onIsDirtyChange);

    // Simulate user making a change that marks the editor dirty
    const makeDirtyBtn = screen.getByTestId('make-dirty-btn');
    await act(async () => {
      makeDirtyBtn.click();
    });

    expect(onIsDirtyChange).toHaveBeenCalledWith(true);
  });

  it('EPF-03: works correctly when onIsDirtyChange is not provided (no crash)', async () => {
    // Should not throw when the optional prop is omitted
    await expect(renderAtEditStep(undefined)).resolves.not.toThrow();
    expect(screen.getByTestId('editor-layout')).toBeInTheDocument();
  });
});
