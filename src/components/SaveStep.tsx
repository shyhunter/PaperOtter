// Save step: opens native OS Save As dialog, writes processed PDF bytes to chosen path.
// Permissions required:
//   - dialog:allow-save in capabilities/default.json
//   - fs:allow-write-file in capabilities/default.json
//   - shell:allow-open in capabilities/default.json (for opening saved files)
//   - tauri-plugin-fs registered in lib.rs
import { useEffect, useState, useCallback } from 'react';
import { save, open as openDialog } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import { open } from '@tauri-apps/plugin-shell';
import { toast } from 'sonner';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface MultiFileOutput {
  fileName: string;
  bytes: Uint8Array;
}

export interface SaveStepProps {
  /** Processed PDF bytes to write (single-file mode) */
  processedBytes: Uint8Array;
  /** Source file name — used as default name in the save dialog (with suffix) */
  sourceFileName: string;
  /** Optional override for the default save filename (replaces buildDefaultSaveName) */
  defaultSaveName?: string;
  /** Optional override for the OS file-type filter (replaces PDF Document filter) */
  saveFilters?: Array<{ name: string; extensions: string[] }>;
  /** Path of the saved file — when set, shows the confirmation card */
  savedFilePath?: string | null;
  /** Called to dismiss the save confirmation card */
  onDismissSaveConfirmation?: () => void;
  /** Called with the saved path on success */
  onSaveComplete: (savedPath: string) => void;
  /** Called when user cancels the save dialog */
  onCancel: () => void;
  /** Called to go back to Compare step without saving */
  onBack: () => void;
  /** Multi-file output (e.g., split PDF). If set, enables folder/ZIP save mode. */
  multiFileOutputs?: MultiFileOutput[];
}

type SaveState = 'idle' | 'dialog-open' | 'writing' | 'error';

function buildDefaultSaveName(sourceFileName: string): string {
  const baseName = sourceFileName.replace(/\.pdf$/i, '');
  return `${baseName}-optimised.pdf`;
}

// ── Animated Checkmark ────────────────────────────────────────────────────────

const checkmarkStyles = `
@keyframes checkmark-circle {
  0% { stroke-dashoffset: 166; }
  100% { stroke-dashoffset: 0; }
}
@keyframes checkmark-check {
  0% { stroke-dashoffset: 48; }
  100% { stroke-dashoffset: 0; }
}
@keyframes checkmark-glow {
  0% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.5); }
  100% { box-shadow: 0 0 20px 10px rgba(34, 197, 94, 0); }
}
.checkmark-circle {
  stroke-dasharray: 166;
  stroke-dashoffset: 166;
  animation: checkmark-circle 0.4s ease-in-out forwards;
}
.checkmark-check {
  stroke-dasharray: 48;
  stroke-dashoffset: 48;
  animation: checkmark-check 0.3s ease-in-out 0.3s forwards;
}
.checkmark-glow {
  animation: checkmark-glow 0.6s ease-out 0.5s forwards;
}
`;

function AnimatedCheckmark() {
  return (
    <>
      <style>{checkmarkStyles}</style>
      <div className="w-10 h-10 flex-none rounded-full checkmark-glow">
        <svg viewBox="0 0 52 52" className="w-full h-full">
          <circle
            className="checkmark-circle"
            cx="26"
            cy="26"
            r="25"
            fill="none"
            stroke="#22c55e"
            strokeWidth="2"
          />
          <path
            className="checkmark-check"
            fill="none"
            stroke="#22c55e"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M14.1 27.2l7.1 7.2 16.7-16.8"
          />
        </svg>
      </div>
    </>
  );
}

// ── Save Confirmation Card ────────────────────────────────────────────────────

function SaveConfirmation({ savedPath, onDismiss }: { savedPath: string; onDismiss: () => void }) {
  const handleOpenFile = async () => {
    try {
      await open(savedPath);
    } catch {
      // If open fails (no associated app), reveal in Finder instead
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('reveal_in_finder', { path: savedPath });
      } catch (err2) {
        console.error('Failed to open or reveal saved file:', err2);
      }
    }
  };

  const handleRevealInFinder = async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('reveal_in_finder', { path: savedPath });
    } catch {
      // Fallback: open the parent folder
      try {
        const parentDir = savedPath.substring(0, savedPath.lastIndexOf('/'));
        await open(parentDir);
      } catch (err) {
        console.error('Failed to reveal in Finder:', err);
      }
    }
  };

  return (
    <div className="relative rounded-lg border border-border bg-card shadow-sm p-4 mx-4 mt-3 animate-fade-slide-in">
      <button
        type="button"
        onClick={onDismiss}
        className="absolute top-2 right-2 rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex items-center gap-3 pr-6">
        <AnimatedCheckmark />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">File saved successfully</p>
          <button
            type="button"
            onClick={handleOpenFile}
            className="text-xs text-primary underline cursor-pointer hover:text-primary/80 truncate block max-w-full text-left"
            title={`Open: ${savedPath}`}
          >
            {savedPath}
          </button>
          <button
            type="button"
            onClick={handleRevealInFinder}
            className="text-xs text-muted-foreground hover:text-foreground cursor-pointer mt-0.5"
          >
            Show in Finder
          </button>
        </div>
      </div>
    </div>
  );
}

// ── SaveStep Component ────────────────────────────────────────────────────────

export function SaveStep({
  processedBytes,
  sourceFileName,
  defaultSaveName,
  saveFilters,
  savedFilePath,
  onDismissSaveConfirmation,
  onSaveComplete,
  onCancel,
  onBack,
  multiFileOutputs,
}: SaveStepProps) {
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [multiSaveMode, setMultiSaveMode] = useState<'folder' | 'zip'>('folder');
  const [multiProgress, setMultiProgress] = useState<string | null>(null);

  // ── Multi-file save (folder or ZIP) ──────────────────────────────────────
  const handleMultiFileSave = useCallback(async () => {
    if (!multiFileOutputs || multiFileOutputs.length === 0) return;

    setSaveState('dialog-open');
    setError(null);

    if (multiSaveMode === 'folder') {
      // Folder save — pick a directory, write each file
      let folderPath: string | null = null;
      try {
        folderPath = await openDialog({ directory: true, multiple: false }) as string | null;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Could not open folder picker.';
        setError(message);
        setSaveState('error');
        return;
      }

      if (!folderPath) {
        setSaveState('idle');
        toast('Save cancelled', { description: 'You can try again any time.' });
        onCancel();
        return;
      }

      setSaveState('writing');
      try {
        for (let i = 0; i < multiFileOutputs.length; i++) {
          const output = multiFileOutputs[i];
          setMultiProgress(`Saving ${i + 1}/${multiFileOutputs.length}…`);
          const filePath = `${folderPath}/${output.fileName}`;
          await writeFile(filePath, output.bytes);
        }
        setMultiProgress(null);
        setSaveState('idle');
        onSaveComplete(folderPath);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Could not write files.';
        setError(message);
        setMultiProgress(null);
        setSaveState('error');
      }
    } else {
      // ZIP save — create ZIP in memory, then save as file
      setSaveState('writing');
      setMultiProgress('Creating ZIP…');

      try {
        const { zipSync } = await import('fflate');
        const zipData: Record<string, Uint8Array> = {};
        for (const output of multiFileOutputs) {
          zipData[output.fileName] = output.bytes;
        }
        const zipped = zipSync(zipData);
        setMultiProgress(null);

        // Open save dialog for the ZIP file
        const zipName = defaultSaveName ?? `${sourceFileName.replace(/\.pdf$/i, '')}-split.zip`;
        let savePath: string | null = null;
        try {
          savePath = await save({
            filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
            defaultPath: zipName,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Could not open save dialog.';
          setError(message);
          setSaveState('error');
          return;
        }

        if (!savePath) {
          setSaveState('idle');
          toast('Save cancelled', { description: 'You can try again any time.' });
          onCancel();
          return;
        }

        await writeFile(savePath, zipped);
        setSaveState('idle');
        onSaveComplete(savePath);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Could not create ZIP.';
        setError(message);
        setMultiProgress(null);
        setSaveState('error');
      }
    }
  }, [multiFileOutputs, multiSaveMode, defaultSaveName, sourceFileName, onSaveComplete, onCancel]);

  // ── Multi-file mode: show save mode selector instead of auto-triggering ──
  if (multiFileOutputs && multiFileOutputs.length > 0) {
    // Show confirmation card when done
    if (savedFilePath && onDismissSaveConfirmation) {
      return (
        <div className="flex flex-1 flex-col">
          <SaveConfirmation savedPath={savedFilePath} onDismiss={onDismissSaveConfirmation} />
          <div className="flex-1" />
          <div className="border-t bg-background px-4 py-3 flex items-center gap-3 flex-none">
            <Button variant="outline" size="sm" onClick={onBack} className="flex-none">
              Back
            </Button>
            <div className="flex-1" />
            <Button size="sm" onClick={handleMultiFileSave}>
              Save Again
            </Button>
          </div>
        </div>
      );
    }

    if (saveState === 'writing' || saveState === 'dialog-open') {
      return (
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="text-center space-y-2">
            <p className="text-sm font-medium text-foreground">
              {saveState === 'dialog-open' ? 'Choose a save location…' : multiProgress ?? 'Saving…'}
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
                Back
              </Button>
              <Button size="sm" onClick={handleMultiFileSave} className="flex-1">
                Try Again
              </Button>
            </div>
          </div>
        </div>
      );
    }

    // Default: show save mode picker
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-4">
          <div className="text-center space-y-1">
            <p className="text-sm font-semibold text-foreground">
              Save {multiFileOutputs.length} file{multiFileOutputs.length !== 1 ? 's' : ''}
            </p>
            <p className="text-xs text-muted-foreground">Choose how to save the split files.</p>
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-3 rounded-lg border border-border p-3 cursor-pointer hover:bg-accent/50 transition-colors">
              <input
                type="radio"
                name="multi-save-mode"
                checked={multiSaveMode === 'folder'}
                onChange={() => setMultiSaveMode('folder')}
                className="accent-primary"
              />
              <div>
                <p className="text-sm font-medium text-foreground">Save to Folder</p>
                <p className="text-xs text-muted-foreground">Each file saved individually with auto-naming</p>
              </div>
            </label>
            <label className="flex items-center gap-3 rounded-lg border border-border p-3 cursor-pointer hover:bg-accent/50 transition-colors">
              <input
                type="radio"
                name="multi-save-mode"
                checked={multiSaveMode === 'zip'}
                onChange={() => setMultiSaveMode('zip')}
                className="accent-primary"
              />
              <div>
                <p className="text-sm font-medium text-foreground">Save as ZIP</p>
                <p className="text-xs text-muted-foreground">All files bundled into a single ZIP archive</p>
              </div>
            </label>
          </div>

          <div className="flex gap-3">
            <Button variant="outline" size="sm" onClick={onBack} className="flex-none">
              Back
            </Button>
            <Button size="sm" onClick={handleMultiFileSave} className="flex-1">
              Save
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Single-file save (original behavior) ─────────────────────────────────
  const handleSave = useCallback(async () => {
    setSaveState('dialog-open');
    setError(null);

    // E2E test hook: capture save options without opening the OS dialog.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).__E2E_CAPTURE_SAVE_OPTS__) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window as any).__E2E_CAPTURE_SAVE_OPTS__;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__E2E_SAVE_OPTS__ = {
        options: {
          filters: saveFilters ?? [{ name: 'PDF Document', extensions: ['pdf'] }],
          defaultPath: defaultSaveName ?? buildDefaultSaveName(sourceFileName),
        },
      };
      setSaveState('idle');
      onCancel();
      return;
    }

    // E2E test hook: use a pre-set path to bypass the OS save dialog.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const e2eSavePath = (window as any).__E2E_SAVE_PATH__ as string | undefined;
    if (e2eSavePath) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window as any).__E2E_SAVE_PATH__;
      setSaveState('writing');
      try {
        await writeFile(e2eSavePath, processedBytes);
        setSaveState('idle');
        onSaveComplete(e2eSavePath);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Could not write file.';
        setError(message);
        setSaveState('error');
      }
      return;
    }

    let savePath: string | null = null;
    try {
      savePath = await save({
        filters: saveFilters ?? [{ name: 'PDF Document', extensions: ['pdf'] }],
        defaultPath: defaultSaveName ?? buildDefaultSaveName(sourceFileName),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not open save dialog.';
      setError(message);
      setSaveState('error');
      return;
    }

    if (!savePath) {
      setSaveState('idle');
      toast('Save cancelled', { description: 'You can try again any time.' });
      onCancel();
      return;
    }

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

  // Auto-trigger the save dialog on mount (only if no savedFilePath yet)
  useEffect(() => {
    if (!savedFilePath) {
      handleSave();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Show confirmation card when savedFilePath is set
  if (savedFilePath && onDismissSaveConfirmation) {
    return (
      <div className="flex flex-1 flex-col">
        <SaveConfirmation
          savedPath={savedFilePath}
          onDismiss={onDismissSaveConfirmation}
        />
        <div className="flex-1" />
        <div className="border-t bg-background px-4 py-3 flex items-center gap-3 flex-none">
          <Button variant="outline" size="sm" onClick={onBack} className="flex-none">
            Back
          </Button>
          <div className="flex-1" />
          <Button size="sm" onClick={handleSave}>
            Save Again
          </Button>
        </div>
      </div>
    );
  }

  if (saveState === 'dialog-open' || saveState === 'writing') {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="text-center space-y-3">
          <div className="mx-auto h-8 w-8 rounded-full border-2 border-muted-foreground/30 border-t-primary animate-spin" />
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

  return null;
}
