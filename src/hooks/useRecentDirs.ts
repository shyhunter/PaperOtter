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
          // Only a clean `false` means the folder is gone.
          if (await exists(d)) valid.push(d);
        } catch {
          // A throw here is the capability scope refusing to look, not an
          // answer about the folder. fs:allow-exists covers Documents,
          // Downloads, Desktop and Temp, so a folder anywhere else -- iCloud
          // Drive, a working directory in $HOME, an external disk -- was
          // recorded on use and then silently dropped on the next launch.
          // Worse, `$DESKTOP/**` matches the children of Desktop and not
          // Desktop itself, so even that vanished. A real list of five came
          // back as one.
          //
          // Keeping it costs nothing and loses nothing: the entry is only ever
          // used as the starting folder for the file dialog, which is an OS
          // window that the scope does not bind, and whatever is chosen there
          // is granted to the app by the dialog plugin. So a folder this
          // process may not stat is still one the user can open from.
          valid.push(d);
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
