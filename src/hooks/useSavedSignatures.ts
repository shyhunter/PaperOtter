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
}

export function useSavedSignatures() {
  const [signatures, setSignatures] = useState<SavedSignature[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const saved = await store.get<SavedSignature[]>(STORE_KEY) ?? [];
        setSignatures(saved);
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

  return { signatures, saveSignature, deleteSignature, isLoading };
}
