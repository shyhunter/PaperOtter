import { LazyStore } from '@tauri-apps/plugin-store';
import { useEffect, useState, useCallback } from 'react';

const store = new LazyStore('papercut-settings.json');
const STORE_KEY = 'saved-signatures';
const MAX_SIGNATURES = 10;

export interface SavedSignature {
  id: string;
  name: string;
  type: 'drawn' | 'typed' | 'uploaded';
  dataUrl: string;
  createdAt: number;
  /**
   * What sits behind the signature on the page: a "#rrggbb", or null/absent for
   * none at all. Absent on everything saved before the setting existed, which
   * reads as transparent, which is what those signatures already did.
   */
  background?: string | null;
  /**
   * Set only on entries carried over from the editor's old localStorage list,
   * which stored the recipe rather than the image. The panel rasterises these
   * on first sight and fills in dataUrl.
   */
  legacyFont?: string;
  legacyColor?: string;
}

/**
 * The shape the editor's sign panel used to keep in localStorage.
 *
 * It stored the recipe rather than the result, so it could only ever hold typed
 * signatures, and nothing drawn or uploaded in Sign PDF was visible to it. The
 * two tools have kept separate lists in separate places for as long as both have
 * existed: a signature saved in one simply did not appear in the other.
 */
interface LegacyEditorSignature {
  text: string;
  font: string;
  color: string;
  createdAt: number;
}

const LEGACY_EDITOR_KEY = 'papercut_saved_signatures';

/**
 * Moves anything the editor kept in localStorage into the shared store, once.
 *
 * Carried across as a recipe rather than an image: rasterising here would need a
 * canvas and the signature fonts at a moment nothing is on screen, and the panel
 * that draws these can do it properly when it shows them. `dataUrl` is left
 * empty and the recipe travels in `name`, which is what the old list displayed
 * anyway.
 *
 * Clears the old key afterwards so this cannot run twice and duplicate a list.
 * A failure here is silent by design: an old signature that will not migrate is
 * not a reason to refuse to open the tool.
 */
export function migrateLegacyEditorSignatures(existing: SavedSignature[]): SavedSignature[] | null {
  if (typeof localStorage === 'undefined') return null;
  let legacy: LegacyEditorSignature[];
  try {
    const raw = localStorage.getItem(LEGACY_EDITOR_KEY);
    if (!raw) return null;
    legacy = JSON.parse(raw) as LegacyEditorSignature[];
    if (!Array.isArray(legacy) || legacy.length === 0) {
      localStorage.removeItem(LEGACY_EDITOR_KEY);
      return null;
    }
  } catch {
    return null;
  }

  const seen = new Set(existing.map((s) => s.name));
  const brought: SavedSignature[] = legacy
    .filter((l) => l && typeof l.text === 'string' && l.text.trim() && !seen.has(l.text))
    .map((l) => ({
      id: crypto.randomUUID(),
      name: l.text,
      type: 'typed' as const,
      dataUrl: '',
      createdAt: typeof l.createdAt === 'number' ? l.createdAt : Date.now(),
      legacyFont: l.font,
      legacyColor: l.color,
    }));

  try { localStorage.removeItem(LEGACY_EDITOR_KEY); } catch { /* nothing to undo */ }
  if (brought.length === 0) return null;
  return [...brought, ...existing].slice(0, MAX_SIGNATURES);
}

export function useSavedSignatures() {
  const [signatures, setSignatures] = useState<SavedSignature[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const saved = await store.get<SavedSignature[]>(STORE_KEY) ?? [];
        const migrated = migrateLegacyEditorSignatures(saved);
        if (migrated) {
          await store.set(STORE_KEY, migrated);
          await store.save();
          setSignatures(migrated);
        } else {
          setSignatures(saved);
        }
      } catch {
        // Store read failed -- start with empty list
        setSignatures([]);
      }
      setIsLoading(false);
    })();
  }, []);

  const saveSignature = useCallback(async (sig: Omit<SavedSignature, 'id' | 'createdAt'>) => {
    const newSig: SavedSignature = {
      ...sig,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
    };
    const current = await store.get<SavedSignature[]>(STORE_KEY) ?? [];
    const next = [newSig, ...current].slice(0, MAX_SIGNATURES);
    await store.set(STORE_KEY, next);
    await store.save(); // LazyStore does NOT auto-persist -- always call save()
    setSignatures(next);
    return newSig;
  }, []);

  const deleteSignature = useCallback(async (id: string) => {
    const current = await store.get<SavedSignature[]>(STORE_KEY) ?? [];
    const next = current.filter(s => s.id !== id);
    await store.set(STORE_KEY, next);
    await store.save();
    setSignatures(next);
  }, []);

  /** Changes what sits behind one saved signature. */
  const setSignatureBackground = useCallback(async (id: string, background: string | null) => {
    const current = await store.get<SavedSignature[]>(STORE_KEY) ?? [];
    const next = current.map((s) => (s.id === id ? { ...s, background } : s));
    await store.set(STORE_KEY, next);
    await store.save();
    setSignatures(next);
  }, []);

  return { signatures, saveSignature, deleteSignature, setSignatureBackground, isLoading };
}
