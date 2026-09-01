// The destinations a user can check a document against: the built-ins, plus the
// ones they named themselves.
//
// Their own are the point. A preset named for a consulate or a university would
// be this app claiming to know someone else's rules — those vary by office and
// change without notice. The user read the form; they name it.
import { useState, useEffect, useCallback } from 'react';
import { LazyStore } from '@tauri-apps/plugin-store';
import { BUILT_IN_DESTINATIONS, type DestinationRequirement } from '@/lib/destinations';

const store = new LazyStore('papercut-settings.json');
const STORE_KEY = 'destinations';

/** What a caller supplies when saving; the id and the flag are ours to set. */
export type NewDestination = Omit<DestinationRequirement, 'id' | 'userDefined' | 'nameKey'>;

function isUserDestination(value: unknown): value is DestinationRequirement {
  if (typeof value !== 'object' || value === null) return false;
  const d = value as Record<string, unknown>;
  return typeof d.id === 'string' && typeof d.name === 'string';
}

export function useDestinations() {
  const [userDefined, setUserDefined] = useState<DestinationRequirement[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    store
      .get<unknown>(STORE_KEY)
      .then((stored) => {
        if (cancelled) return;
        // The file is on the user's disk and can be anything. Falling back to
        // the built-ins beats an empty picker with no explanation.
        if (Array.isArray(stored)) {
          setUserDefined(stored.filter(isUserDestination).map((d) => ({ ...d, userDefined: true })));
        }
      })
      .catch(() => {
        // No file yet, or an unreadable one. The built-ins still work.
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => { cancelled = true; };
  }, []);

  const persist = useCallback(async (next: DestinationRequirement[]) => {
    setUserDefined(next);
    try {
      await store.set(STORE_KEY, next);
      await store.save();
    } catch {
      // Kept for this session even if the write failed — losing the name they
      // just typed on top of a failed save helps nobody.
    }
  }, []);

  const save = useCallback(async (destination: NewDestination) => {
    const entry: DestinationRequirement = {
      ...destination,
      id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      userDefined: true,
    };
    await persist([...userDefined, entry]);
    return entry;
  }, [userDefined, persist]);

  /** Built-ins are not the user's to delete, so an id that is not theirs is ignored. */
  const remove = useCallback(async (id: string) => {
    if (!userDefined.some((d) => d.id === id)) return;
    await persist(userDefined.filter((d) => d.id !== id));
  }, [userDefined, persist]);

  return {
    destinations: [...BUILT_IN_DESTINATIONS, ...userDefined],
    loaded,
    save,
    remove,
  };
}
