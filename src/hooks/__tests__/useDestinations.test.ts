// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useDestinations } from '@/hooks/useDestinations';
import { BUILT_IN_DESTINATIONS } from '@/lib/destinations';

/**
 * [DEST-STORE] The user's own destinations, kept across sessions.
 *
 * The repeat user is the persona — twelve scans for one application, then the
 * same portal again next year. A destination they named themselves is worth
 * more than any guess this app could ship, because they are the one who read
 * the form.
 */

const store = { get: vi.fn(), set: vi.fn(), save: vi.fn() };
vi.mock('@tauri-apps/plugin-store', () => ({
  LazyStore: class { get(...a: unknown[]) { return store.get(...a); } set(...a: unknown[]) { return store.set(...a); } save() { return store.save(); } },
}));

beforeEach(() => {
  store.get.mockReset().mockResolvedValue(null);
  store.set.mockReset().mockResolvedValue(undefined);
  store.save.mockReset().mockResolvedValue(undefined);
});

describe('useDestinations', () => {
  it('[DEST-STORE-01] offers the built-ins before anything is saved', async () => {
    const { result } = renderHook(() => useDestinations());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.destinations.map((d) => d.id)).toEqual(BUILT_IN_DESTINATIONS.map((d) => d.id));
  });

  it('[DEST-STORE-02] a saved destination is marked as the user’s own', async () => {
    const { result } = renderHook(() => useDestinations());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(async () => {
      await result.current.save({ name: 'Turkish consulate', maxBytes: 1024 * 1024 });
    });

    const mine = result.current.destinations.find((d) => d.name === 'Turkish consulate');
    expect(mine?.userDefined, 'a user destination must be distinguishable from a built-in').toBe(true);
    expect(mine?.id).toBeTruthy();
    expect(store.set).toHaveBeenCalled();
  });

  it('[DEST-STORE-03] built-ins cannot be deleted, the user’s own can', async () => {
    store.get.mockResolvedValue([{ id: 'u1', name: 'Mine', maxBytes: 99, userDefined: true }]);
    const { result } = renderHook(() => useDestinations());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.destinations.some((d) => d.id === 'u1')).toBe(true);

    await act(async () => { await result.current.remove('u1'); });
    expect(result.current.destinations.some((d) => d.id === 'u1')).toBe(false);

    // A built-in is not the user's to delete; asking must not thin the list.
    const before = result.current.destinations.length;
    await act(async () => { await result.current.remove(BUILT_IN_DESTINATIONS[0].id); });
    expect(result.current.destinations.length).toBe(before);
  });

  it('[DEST-STORE-04] a corrupt store falls back to the built-ins rather than showing nothing', async () => {
    // The file is on the user's disk and can be anything. An empty picker with
    // no explanation is worse than the defaults.
    store.get.mockResolvedValue({ not: 'an array' });
    const { result } = renderHook(() => useDestinations());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.destinations.length).toBe(BUILT_IN_DESTINATIONS.length);
  });

  it('[DEST-STORE-05] survives a store that throws', async () => {
    store.get.mockRejectedValue(new Error('no such file'));
    const { result } = renderHook(() => useDestinations());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.destinations.length).toBe(BUILT_IN_DESTINATIONS.length);
  });
});
