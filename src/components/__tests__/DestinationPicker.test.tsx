// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SavedSettingsRow, SaveSettingAs } from '@/components/destinations/DestinationPicker';
import type { DestinationRequirement } from '@/lib/destinations';

/**
 * [DEST-PICK] Saved settings: applying one, and saving one.
 *
 * Split into two components because the halves belong in opposite places.
 * Applying is an input — a click rewrites the quality, target size and page size
 * below it — so it sits above the controls it moves, where the change can be
 * watched. Saving is an output of those controls, so it sits under them.
 */

const BUILT_IN: DestinationRequirement = { id: 'b1', nameKey: 'destination.email10mb', maxBytes: 10 * 1024 * 1024 };
const MINE: DestinationRequirement = { id: 'u1', name: 'Turkish consulate', maxBytes: 1024 * 1024, userDefined: true };

afterEach(cleanup);

describe('SavedSettingsRow — applying', () => {
  it('[DEST-PICK-01] offers no-destination as a real choice, selected by default', async () => {
    // Most documents are not going to a portal. Not choosing one has to be a
    // state the user can see and return to, not the absence of a state.
    render(<SavedSettingsRow destinations={[BUILT_IN]} selectedId={null} onSelect={vi.fn()} />);
    expect(screen.getByRole('button', { name: /no destination/i })).toHaveAttribute('aria-pressed', 'true');
  });

  it('[DEST-PICK-02] hands back the whole destination, not just its id', async () => {
    // The caller has to apply maxBytes and pageSize to the controls; an id
    // would make every call site look the destination up again.
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<SavedSettingsRow destinations={[BUILT_IN]} selectedId={null} onSelect={onSelect} />);

    await user.click(screen.getByRole('button', { name: /email attachment/i }));
    expect(onSelect).toHaveBeenCalledWith(BUILT_IN);
  });

  it('[DEST-PICK-03] deselecting returns null rather than a sentinel', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<SavedSettingsRow destinations={[BUILT_IN]} selectedId="b1" onSelect={onSelect} />);

    await user.click(screen.getByRole('button', { name: /no destination/i }));
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('[DEST-PICK-04] only the user’s own can be forgotten', () => {
    render(<SavedSettingsRow destinations={[BUILT_IN, MINE]} selectedId={null} onSelect={vi.fn()} onRemove={vi.fn()} />);

    expect(screen.getByRole('button', { name: /forget.*Turkish consulate/i })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /forget.*Email attachment/i }),
      'a built-in is not the user’s to delete',
    ).toBeNull();
  });

  it('[DEST-PICK-05] saving asks for a name and will not accept an empty one', async () => {
    const onSaveCurrent = vi.fn();
    const user = userEvent.setup();
    render(<SaveSettingAs onSave={onSaveCurrent} hasSaved={true} />);

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
    render(<SaveSettingAs onSave={onSaveCurrent} hasSaved={false} />);

    await user.click(screen.getByRole('button', { name: /save these settings/i }));
    await user.type(screen.getByLabelText(/destination name/i), 'Consulate{Enter}');
    expect(onSaveCurrent).toHaveBeenCalledWith('Consulate');

    await user.click(screen.getByRole('button', { name: /save these settings/i }));
    await user.type(screen.getByLabelText(/destination name/i), 'Discarded{Escape}');
    expect(onSaveCurrent).toHaveBeenCalledTimes(1);
  });
});

describe('with nothing saved yet', () => {
  it('[DEST-PICK-07] explains what saving is for instead of showing an empty row', async () => {
    // The built-in list ships empty by decision, so this is the first-run state
    // for everyone. A bare "No destination" pill with nothing beside it does not
    // say what the feature is, and there is no example to show without inventing
    // somebody's use case -- which is the thing that was removed.
    render(<SaveSettingAs onSave={vi.fn()} hasSaved={false} />);

    expect(screen.getByTestId('destination-empty')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save these settings/i })).toBeInTheDocument();
  });

  it('[DEST-PICK-08] the name field suggests nothing about the use case', async () => {
    // The placeholder read "e.g. Turkish consulate visa". Removing the built-in
    // presets because they assume a use case, while leaving an example that
    // assumes one, would have kept the same mistake in a smaller font.
    const user = userEvent.setup();
    render(<SaveSettingAs onSave={vi.fn()} hasSaved={false} />);

    await user.click(screen.getByRole('button', { name: /save these settings/i }));
    const field = screen.getByLabelText(/name/i) as HTMLInputElement;

    expect(field.placeholder).not.toMatch(/e\.g\.|consulate|visa|passport|university/i);
    expect(field.placeholder.length, 'it still has to say what to type').toBeGreaterThan(0);
  });

  it('[DEST-PICK-09] the row renders nothing at all when there is nothing to choose', () => {
    // Every first run, now the list ships empty. "None" is only a meaningful
    // choice once there is another one beside it — a heading over a single dead
    // pill is a control that does nothing, permanently, for anyone who never
    // saves one.
    const { container } = render(
      <SavedSettingsRow destinations={[]} selectedId={null} onSelect={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('button', { name: /none/i })).toBeNull();
  });
});
