// Save step: opens native OS Save As dialog, writes processed PDF bytes to chosen path.
// Permissions required (already added in 02-01):
//   - dialog:allow-save in capabilities/default.json
//   - fs:allow-write-file in capabilities/default.json
//   - tauri-plugin-fs registered in lib.rs
import { useEffect, useState, useCallback } from 'react';
import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

export interface SaveStepProps {
  /** Processed PDF bytes to write */
  processedBytes: Uint8Array;
  /** Source file name — used as default name in the save dialog (with suffix) */
  sourceFileName: string;
  /** Optional override for the default save filename (replaces buildDefaultSaveName) */
  defaultSaveName?: string;
  /** Optional override for the OS file-type filter (replaces PDF Document filter) */
  saveFilters?: Array<{ name: string; extensions: string[] }>;
  /** Called with the saved path on success */
  onSaveComplete: (savedPath: string) => void;
  /** Called when user cancels the save dialog */
  onCancel: () => void;
  /** Called to go back to Compare step without saving */
  onBack: () => void;
}

type SaveState = 'idle' | 'dialog-open' | 'writing' | 'error';

function buildDefaultSaveName(sourceFileName: string): string {
  // Insert '-optimised' before the .pdf extension
  const baseName = sourceFileName.replace(/\.pdf$/i, '');
  return `${baseName}-optimised.pdf`;
}

export function SaveStep({
  processedBytes,
  sourceFileName,
  defaultSaveName,
  saveFilters,
  onSaveComplete,
  onCancel,
  onBack,
}: SaveStepProps) {
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [error, setError] = useState<string | null>(null);

  const handleSave = useCallback(async () => {
    setSaveState('dialog-open');
    setError(null);

    let savePath: string | null = null;
    try {
      savePath = await save({
        filters: saveFilters ?? [{ name: 'PDF Document', extensions: ['pdf'] }],
        defaultPath: defaultSaveName ?? buildDefaultSaveName(sourceFileName),
      });
    } catch (err) {
      // Dialog open error (unlikely but handle gracefully)
      const message = err instanceof Error ? err.message : 'Could not open save dialog.';
      setError(message);
      setSaveState('error');
      return;
    }

    // User cancelled the dialog — show toast and return to Compare
    if (!savePath) {
      setSaveState('idle');
      toast('Save cancelled', { description: 'You can try again any time.' });
      onCancel();
      return;
    }

    // Write the file
    setSaveState('writing');
    try {
      await writeFile(savePath, processedBytes);
      setSaveState('idle');
      onSaveComplete(savePath);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Could not write file. Check that you have permission to write to the selected location.';
      setError(message);
      setSaveState('error');
    }
  }, [processedBytes, sourceFileName, defaultSaveName, saveFilters, onSaveComplete, onCancel]);

  // Auto-trigger the save dialog as soon as this step mounts
  useEffect(() => {
    handleSave();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount only

  if (saveState === 'dialog-open' || saveState === 'writing') {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="text-center space-y-2">
          <p className="text-sm font-medium text-foreground">
            {saveState === 'dialog-open' ? 'Choose a save location…' : 'Saving…'}
          </p>
          <p className="text-xs text-muted-foreground">
            {saveState === 'writing' ? `Writing ${defaultSaveName ?? buildDefaultSaveName(sourceFileName)}` : ''}
          </p>
        </div>
      </div>
    );
  }

  if (saveState === 'error' && error) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-4">
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3">
            <p className="text-xs font-medium text-destructive">Save failed</p>
            <p className="text-xs text-destructive/80 mt-1">{error}</p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" size="sm" onClick={onBack} className="flex-none">
              Back to Compare
            </Button>
            <Button size="sm" onClick={handleSave} className="flex-1">
              Try Again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // idle — should not normally be visible (auto-triggers dialog on mount)
  return null;
}
