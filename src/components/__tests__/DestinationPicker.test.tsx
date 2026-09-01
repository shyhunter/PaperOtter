// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DestinationPicker } from '@/components/destinations/DestinationPicker';
import type { DestinationRequirement } from '@/lib/destinations';

/** [DEST-PICK] Choosing what the document is being prepared for. */

const BUILT_IN: DestinationRequirement = { id: 'b1', nameKey: 'destination.email10mb', maxBytes: 10 * 1024 * 1024 };
const MINE: DestinationRequirement = { id: 'u1', name: 'Turkish consulate', maxBytes: 1024 * 1024, userDefined: true };

afterEach(cleanup);

describe('DestinationPicker', () => {
  it('[DEST-PICK-01] offers no-destination as a real choice, selected by default', async () => {
    // Most documents are not going to a portal. Not choosing one has to be a
    // state the user can see and return to, not the absence of a state.
    render(<DestinationPicker destinations={[BUILT_IN]} selectedId={null} onSelect={vi.fn()} />);
    expect(screen.getByRole('button', { name: /no destination/i })).toHaveAttribute('aria-pressed', 'true');
  });

  it('[DEST-PICK-02] hands back the whole destination, not just its id', async () => {
    // The caller has to apply maxBytes and pageSize to the controls; an id
    // would make every call site look the destination up again.
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<DestinationPicker destinations={[BUILT_IN]} selectedId={null} onSelect={onSelect} />);

    await user.click(screen.getByRole('button', { name: /email attachment/i }));
    expect(onSelect).toHaveBeenCalledWith(BUILT_IN);
  });

  it('[DEST-PICK-03] deselecting returns null rather than a sentinel', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<DestinationPicker destinations={[BUILT_IN]} selectedId="b1" onSelect={onSelect} />);

    await user.click(screen.getByRole('button', { name: /no destination/i }));
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('[DEST-PICK-04] only the user’s own can be forgotten', () => {
    render(<DestinationPicker destinations={[BUILT_IN, MINE]} selectedId={null} onSelect={vi.fn()} onRemove={vi.fn()} />);

    expect(screen.getByRole('button', { name: /forget.*Turkish consulate/i })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /forget.*Email attachment/i }),
      'a built-in is not the user’s to delete',
    ).toBeNull();
  });

  it('[DEST-PICK-05] saving asks for a name and will not accept an empty one', async () => {
    const onSaveCurrent = vi.fn();
    const user = userEvent.setup();
    render(<DestinationPicker destinations={[BUILT_IN]} selectedId={null} onSelect={vi.fn()} onSaveCurrent={onSaveCurrent} />);

    await user.click(screen.getByRole('button', { name: /save these settings/i }));
    const field = screen.getByLabelText(/destination name/i);

    // An unnamed destination is unrecognisable in the picker next time.
    expect(screen.getByRole('button', { name: /^save$/i })).toBeDisabled();

    await user.type(field, '  Turkish consulate  ');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    // Trimmed: leading space makes it sort oddly and read as a mistake.
    expect(onSaveCurrent).toHaveBeenCalledWith('Turkish consulate');
  });

  it('[DEST-PICK-06] Enter saves and Escape abandons', async () => {
    const onSaveCurrent = vi.fn();
    const user = userEvent.setup();
    render(<DestinationPicker destinations={[]} selectedId={null} onSelect={vi.fn()} onSaveCurrent={onSaveCurrent} />);

    await user.click(screen.getByRole('button', { name: /save these settings/i }));
    await user.type(screen.getByLabelText(/destination name/i), 'Consulate{Enter}');
    expect(onSaveCurrent).toHaveBeenCalledWith('Consulate');

    await user.click(screen.getByRole('button', { name: /save these settings/i }));
    await user.type(screen.getByLabelText(/destination name/i), 'Discarded{Escape}');
    expect(onSaveCurrent).toHaveBeenCalledTimes(1);
  });
});
