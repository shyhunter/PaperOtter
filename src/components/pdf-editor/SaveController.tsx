// SaveController: invisible component that handles Cmd+S / Cmd+Shift+S save shortcuts
// and the save logic for the PDF editor.
//
// Save: if filePath is null → Save As dialog, otherwise overwrite in-place.
// Save As: always opens dialog regardless of existing filePath.
import { useEffect, useCallback, useState, useRef } from 'react';
import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import { toast } from 'sonner';
import { useEditorContext } from '@/context/EditorContext';
import { applyAllEdits } from '@/lib/pdfEditor';

export function SaveController() {
  const { state, setFilePath, setFileName, clearDirty } = useEditorContext();
  const [isSaving, setIsSaving] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  const doSave = useCallback(async (forceSaveAs: boolean) => {
    if (isSaving) return;
    setIsSaving(true);

    try {
      const currentState = stateRef.current;

      // Generate final PDF bytes with all edits baked in
      const finalBytes = await applyAllEdits(currentState.pdfBytes, currentState.pages);

      let targetPath = currentState.filePath;

      // If no file path yet (first save) or Save As requested, open dialog
      if (!targetPath || forceSaveAs) {
        const defaultName = currentState.fileName || 'Untitled.pdf';
        const selected = await save({
          defaultPath: targetPath
            ? targetPath.replace(/[^/\\]+$/, defaultName)
            : defaultName,
          filters: [{ name: 'PDF Document', extensions: ['pdf'] }],
        });
        if (!selected) {
          setIsSaving(false);
          return; // User cancelled
        }
        targetPath = selected;
      }

      // Write the file
      await writeFile(targetPath, finalBytes);

      // Update state
      if (targetPath !== currentState.filePath) {
        setFilePath(targetPath);
        const newName = targetPath.split('/').pop() ?? targetPath.split('\\').pop() ?? 'Untitled.pdf';
        setFileName(newName);
      }
      clearDirty();

      toast.success('Saved', { duration: 1500 });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Save failed';
      toast.error('Failed to save', { description: msg });
    } finally {
      setIsSaving(false);
    }
  }, [isSaving, setFilePath, setFileName, clearDirty]);

  // Register keyboard shortcuts: Cmd+S = Save, Cmd+Shift+S = Save As
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        if (e.shiftKey) {
          doSave(true); // Save As
        } else {
          doSave(false); // Save
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [doSave]);

  // Saving indicator
  if (isSaving) {
    return (
      <div className="fixed top-2 right-2 z-50 flex items-center gap-2 rounded bg-muted px-3 py-1.5 text-xs text-muted-foreground shadow-sm">
        <div className="h-3 w-3 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
        Saving...
      </div>
    );
  }

  return null;
}

/**
 * Hook for triggering save from other components (e.g. toolbar button).
 * Returns save/saveAs functions that can be called imperatively.
 */
export function useSaveActions() {
  const { state, setFilePath, setFileName, clearDirty } = useEditorContext();
  const [isSaving, setIsSaving] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  const doSave = useCallback(async (forceSaveAs: boolean): Promise<boolean> => {
    if (isSaving) return false;
    setIsSaving(true);

    try {
      const currentState = stateRef.current;
      const finalBytes = await applyAllEdits(currentState.pdfBytes, currentState.pages);

      let targetPath = currentState.filePath;

      if (!targetPath || forceSaveAs) {
        const defaultName = currentState.fileName || 'Untitled.pdf';
        const selected = await save({
          defaultPath: targetPath
            ? targetPath.replace(/[^/\\]+$/, defaultName)
            : defaultName,
          filters: [{ name: 'PDF Document', extensions: ['pdf'] }],
        });
        if (!selected) {
          setIsSaving(false);
          return false;
        }
        targetPath = selected;
      }

      await writeFile(targetPath, finalBytes);

      if (targetPath !== currentState.filePath) {
        setFilePath(targetPath);
        const newName = targetPath.split('/').pop() ?? targetPath.split('\\').pop() ?? 'Untitled.pdf';
        setFileName(newName);
      }
      clearDirty();
      toast.success('Saved', { duration: 1500 });
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Save failed';
      toast.error('Failed to save', { description: msg });
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [isSaving, setFilePath, setFileName, clearDirty]);

  return {
    save: () => doSave(false),
    saveAs: () => doSave(true),
    isSaving,
  };
}
