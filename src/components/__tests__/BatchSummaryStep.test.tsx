// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BatchSummaryStep } from '@/components/batch/BatchSummaryStep';

// ─── Batch summary (BATCH-04) ────────────────────────────────────────────────
//
// "A clear summary of what succeeded and what did not." For the persona this is
// the moment of truth: they handed over twelve scans for a visa application and
// need to know, before they upload anything, which ones came back.

const succeeded = [
  { path: '/s/a.pdf', fileName: 'a-optimised.pdf', inputSizeBytes: 4_000_000, outputSizeBytes: 1_000_000 },
  { path: '/s/b.pdf', fileName: 'b-optimised.pdf', inputSizeBytes: 2_000_000, outputSizeBytes: 1_000_000 },
];
const failed = [{ path: '/s/c.pdf', message: 'This file is not a valid PDF document.' }];

function renderSummary(props: Partial<React.ComponentProps<typeof BatchSummaryStep>> = {}) {
  return render(
    <BatchSummaryStep
      succeeded={succeeded}
      failed={failed}
      cancelled={false}
      onSave={vi.fn()}
      onBack={vi.fn()}
      {...props}
    />,
  );
}

afterEach(cleanup);

describe('BatchSummaryStep', () => {
  it('[BATCH-04a] says how many files came through', async () => {
    renderSummary();
    // "2 files ready to save" in the heading; the Save button says it too.
    expect(await screen.findByText(/2 files ready to save/i)).toBeInTheDocument();
  });

  it('[BATCH-04b] names every file that failed, with its reason', () => {
    renderSummary();
    // A count alone would leave the user guessing which scan to redo.
    expect(screen.getByText(/c\.pdf/)).toBeInTheDocument();
    expect(screen.getByText(/not a valid PDF document/i)).toBeInTheDocument();
  });

  it('[BATCH-04c] still offers to save the files that did work', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    renderSummary({ onSave });

    await user.click(screen.getByRole('button', { name: /save/i }));
    expect(onSave).toHaveBeenCalled();
  });

  it('[BATCH-04d] does not offer a save when nothing succeeded', () => {
    renderSummary({ succeeded: [] });
    expect(screen.queryByRole('button', { name: /^save/i })).not.toBeInTheDocument();
  });

  it('[BATCH-04e] says so when the run was stopped part-way', () => {
    // Otherwise a user who cancels at file 3 of 12 sees a summary of 2 files
    // and has no way to tell that from a batch where 10 failed silently.
    renderSummary({ cancelled: true });
    expect(screen.getByText(/stopped/i)).toBeInTheDocument();
  });

  it('[BATCH-04f] reports the space actually saved across the batch', () => {
    renderSummary();
    // 6,000,000 bytes in, 2,000,000 out. formatBytes is 1024-based, so that is
    // 3.81 MB saved with 1.91 MB left to write, not 4 MB and 2 MB. Matched as
    // the whole sentence: those figures also appear in the per-file rows.
    expect(screen.getByText(/Saved 3\.81 MB in total: 1\.91 MB to write\./))
      .toBeInTheDocument();
  });

  it('[BATCH-04g] a clean run shows no failure section at all', () => {
    renderSummary({ failed: [] });
    expect(screen.queryByText(/could not be processed/i)).not.toBeInTheDocument();
  });
});
