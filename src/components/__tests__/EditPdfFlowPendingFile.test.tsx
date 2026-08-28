// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StrictMode, useState } from 'react';
import { render, screen, cleanup, act, waitFor } from '@testing-library/react';
import { EditPdfFlow } from '@/components/edit-pdf/EditPdfFlow';
import { ToolProvider, useToolContext } from '@/context/ToolContext';

// ─── PENDING-01 — a dropped file must not be asked for twice ─────────────────
//
// EditPdfFlow.test.tsx mocks useToolContext with a constant array and a no-op
// setPendingFiles, so the handoff can never fail there: the value is always
// present and the clear does nothing. This one uses the real ToolProvider and
// real StrictMode, mounting the flow the way the dashboard does — stage the
// file, then render the tool — which is the only arrangement that can show
// whether the file actually survives the trip.

vi.mock('pdf-lib', () => ({
  PDFDocument: {
    load: vi.fn().mockResolvedValue({ getPageCount: vi.fn().mockReturnValue(1) }),
  },
}));

vi.mock('@/components/edit-pdf/EditorLayout', () => ({
  EditorLayout: vi.fn(() => <div data-testid="editor-layout" />),
}));

vi.mock('@/components/SaveStep', () => ({
  SaveStep: vi.fn(() => <div data-testid="save-step" />),
}));

vi.mock('@/components/ErrorBoundary', () => ({
  StepErrorBoundary: vi.fn(({ children }: { children: React.ReactNode }) => <>{children}</>),
}));

/** Mirrors Dashboard.handleToolClick: stage the file, then mount the tool. */
function Harness() {
  const { setPendingFiles } = useToolContext();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => { setPendingFiles(['/Volumes/USB/scan.pdf']); setOpen(true); }}>
        open edit pdf
      </button>
      {open && <EditPdfFlow />}
    </>
  );
}

afterEach(cleanup);
beforeEach(() => { vi.clearAllMocks(); });

describe('EditPdfFlow pending-file handoff', () => {
  it('[PENDING-01] opens the dropped file instead of showing its file picker', async () => {
    render(
      <StrictMode>
        <ToolProvider>
          <Harness />
        </ToolProvider>
      </StrictMode>,
    );

    await act(async () => { screen.getByText('open edit pdf').click(); });

    // Reaching the editor is the whole contract: the user dragged the file in,
    // so being returned to "Select a PDF to edit" means it was lost.
    await waitFor(() => {
      expect(screen.getByTestId('editor-layout')).toBeInTheDocument();
    });
  });
});
