import { useState, useEffect, useCallback } from 'react';
import { LazyStore } from '@tauri-apps/plugin-store';
import type { ToolId } from '@/types/tools';

const store = new LazyStore('papercut-settings.json');
const STORE_KEY = 'favorite-tools';
const MAX_FAVORITES = 4;

/** Default favorites for first launch */
const DEFAULT_FAVORITES: ToolId[] = [
  'compress-pdf',
  'merge-pdf',
  'split-pdf',
  'pdf-to-jpg',
];

export function useFavorites() {
  const [favorites, setFavorites] = useState<ToolId[]>(DEFAULT_FAVORITES);
  const [loaded, setLoaded] = useState(false);

  // Load from store on mount
  useEffect(() => {
    let cancelled = false;
    store
      .get<ToolId[]>(STORE_KEY)
      .then((val) => {
        if (!cancelled && Array.isArray(val) && val.length > 0) {
          setFavorites(val.slice(0, MAX_FAVORITES));
        }
      })
      .catch(() => {
        // First launch — use defaults
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => { cancelled = true; };
  }, []);

  // Persist helper
  const persist = useCallback(async (newFavs: ToolId[]) => {
    try {
      await store.set(STORE_KEY, newFavs);
      await store.save();
    } catch {
      // Persistence failure is non-critical
    }
  }, []);

  /** Toggle a tool in/out of favorites */
  const toggleFavorite = useCallback((toolId: ToolId) => {
    setFavorites((prev) => {
      let next: ToolId[];
      if (prev.includes(toolId)) {
        next = prev.filter((id) => id !== toolId);
      } else {
        if (prev.length >= MAX_FAVORITES) {
          // Replace last one
          next = [...prev.slice(0, MAX_FAVORITES - 1), toolId];
        } else {
          next = [...prev, toolId];
        }
      }
      persist(next);
      return next;
    });
  }, [persist]);

  /** Reorder favorites (drag-and-drop) */
  const reorderFavorites = useCallback((fromIndex: number, toIndex: number) => {
    setFavorites((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      persist(next);
      return next;
    });
  }, [persist]);

  /** Check if a tool is a favorite */
  const isFavorite = useCallback((toolId: ToolId) => {
    return favorites.includes(toolId);
  }, [favorites]);

  return { favorites, loaded, toggleFavorite, reorderFavorites, isFavorite, maxFavorites: MAX_FAVORITES };
}
