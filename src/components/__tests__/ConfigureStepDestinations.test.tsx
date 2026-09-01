// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfigureStep } from '@/components/ConfigureStep';
import type { DestinationRequirement } from '@/lib/destinations';

/**
 * [DEST-APPLY] Choosing a saved setting puts the whole setting back.
 *
 * Reported after first use: "my current optimise file size is Print, but I
 * choose my saved setting which was Web — clicking it should make it Web."
 *
 * A saved setting that restores the size limit and leaves everything else on
 * whatever the last document used is not the setting that was saved. It is a
 * partial restore that looks like a full one, which is worse than no restore at
 * all: the user believes they are back where they were.
 */

const SAVED: DestinationRequirement[] = [
  { id: 'u1', name: 'My upload', qualityLevel: 'web', userDefined: true },
];

vi.mock('@/hooks/useDestinations', () => ({
  useDestinations: () => ({ destinations: SAVED, loaded: true, save: vi.fn(), remove: vi.fn() }),
}));

const props = {
  fileName: 'scan.pdf',
  pageCount: 3,
  fileSizeBytes: 5 * 1024 * 1024,
  compressibilityScore: 0.8,
  imageCount: 4,
  jpxByteShare: 0,
  isProcessing: false,
  progress: null,
  error: null,
  onBack: vi.fn(),
};

afterEach(cleanup);

describe('Applying a saved setting', () => {
  it('[DEST-APPLY-01] moves the quality slider to the saved level', async () => {
    const onGeneratePreview = vi.fn();
    const user = userEvent.setup();

    render(
      <ConfigureStep
        {...props}
        destination={null}
        onDestinationChange={vi.fn()}
        onGeneratePreview={onGeneratePreview}
      />,
    );

    // Move the slider well away from the saved level first, so a pass cannot
    // come from the default happening to match. fireEvent rather than
    // user-event: jsdom has no selection model for a range input, and
    // user-event's keyboard path throws on it.
    fireEvent.change(screen.getByRole('slider'), { target: { value: '95' } });

    await user.click(screen.getByRole('button', { name: 'My upload' }));
    await user.click(screen.getByRole('button', { name: /generate|preview|continue/i }));

    await waitFor(() => expect(onGeneratePreview).toHaveBeenCalled());
    const options = onGeneratePreview.mock.calls[0][0];
    expect(options.qualityLevel, 'the setting was saved at web').toBe('web');
  });

  it('[DEST-APPLY-02] a setting saved without resizing turns resizing back off', async () => {
    // Otherwise the previous document's A4 silently resizes a document this
    // setting never asked to resize.
    const onGeneratePreview = vi.fn();
    const user = userEvent.setup();

    render(
      <ConfigureStep
        {...props}
        destination={null}
        onDestinationChange={vi.fn()}
        onGeneratePreview={onGeneratePreview}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'My upload' }));
    await user.click(screen.getByRole('button', { name: /generate|preview|continue/i }));

    await waitFor(() => expect(onGeneratePreview).toHaveBeenCalled());
    expect(onGeneratePreview.mock.calls[0][0].resizeEnabled).toBe(false);
  });
});
