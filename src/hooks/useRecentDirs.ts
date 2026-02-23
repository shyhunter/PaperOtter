import { LazyStore } from '@tauri-apps/plugin-store';
import { exists } from '@tauri-apps/plugin-fs';
import { useEffect, useState, useCallback } from 'react';

const store = new LazyStore('papercut-settings.json');
const RECENT_DIRS_KEY = 'recentDirs';
const MAX_RECENT = 5;

export function useRecentDirs() {
  const [dirs, setDirs] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      const saved = await store.get<string[]>(RECENT_DIRS_KEY) ?? [];
      const valid: string[] = [];
      for (const d of saved) {
        try {
          if (await exists(d)) valid.push(d);
        } catch {
          // Forbidden path or OS error — treat as stale, skip silently
        }
      }
      setDirs(valid);
    })();
  }, []);

  const addDir = useCallback(async (filePath: string) => {
    // Normalize separators (Windows backslash → forward slash)
    const normalized = filePath.replace(/\\/g, '/');
    const dir = normalized.substring(0, normalized.lastIndexOf('/'));
    if (!dir) return;

    const saved = await store.get<string[]>(RECENT_DIRS_KEY) ?? [];
    const without = saved.filter(d => d !== dir);
    const next = [dir, ...without].slice(0, MAX_RECENT);
    await store.set(RECENT_DIRS_KEY, next);
    await store.save(); // LazyStore does NOT auto-persist — always call save()
    setDirs(next);
  }, []);

  return { dirs, addDir };
}
