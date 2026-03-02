// Save step: opens native OS Save As dialog, writes processed PDF bytes to chosen path.
// Permissions required:
//   - dialog:allow-save in capabilities/default.json
//   - fs:allow-write-file in capabilities/default.json
//   - shell:allow-open in capabilities/default.json (for opening saved files)
//   - tauri-plugin-fs registered in lib.rs
import { useEffect, useState, useCallback } from 'react';
import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import { open } from '@tauri-apps/plugin-shell';
import { toast } from 'sonner';
import { X } from 'lucide-react';
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
      // Silently ignore — file may have been moved/deleted
    }
  };

  return (
    <div className="relative rounded-lg border border-border bg-card shadow-sm p-4 mx-4 mt-3">
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
            title={savedPath}
          >
            {savedPath}
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
}: SaveStepProps) {
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [error, setError] = useState<string | null>(null);

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

  return null;
}
