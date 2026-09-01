// Save step: opens native OS Save As dialog, writes processed PDF bytes to chosen path.
// Permissions required:
//   - dialog:allow-save in capabilities/default.json
//   - fs:allow-write-file in capabilities/default.json
//   - shell:allow-open in capabilities/default.json (for opening saved files)
//   - tauri-plugin-fs registered in lib.rs
import { useEffect, useState, useCallback, useRef } from 'react';
import { save, open as openDialog } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import { open } from '@tauri-apps/plugin-shell';
import { toast } from 'sonner';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { plural, t } from '@/i18n';
import { uniqueOutputPath, suggestedSavePath } from '@/lib/outputPath';
import { toBytes } from '@/lib/zipOutputs';
import { cn } from '@/lib/utils';
import { getFileName } from '@/lib/fileValidation';
import { saveOverFile, classifySaveFailure, saveFailureMessage } from '@/lib/saveOverFile';
import { revealLabelKey } from '@/lib/platform';

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
  /**
   * The file this flow opened, for a flow that cannot replace it — Convert
   * changes the type, Merge and Split change the count. Only its folder is
   * used, to start Save as… where the document came from. Flows that *can*
   * replace need not pass it; `sourcePath` already says the same thing.
   */
  originPath?: string | null;
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
  /**
   * The file this flow opened, when the result can replace it.
   *
   * Set it only when one file goes in and one file of the same type comes out.
   * Convert and PDF-to-JPG change the type, Merge and Split change the count,
   * and Protect deliberately writes a copy — all of them leave this null and
   * keep the Save As dialog.
   */
  sourcePath?: string | null;
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
        className="absolute top-2 end-2 rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        aria-label={t('common.dismiss')}
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex items-center gap-3 pe-6">
        <AnimatedCheckmark />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">{t('save.success')}</p>
          <button
            type="button"
            onClick={handleOpenFile}
            className="text-xs text-primary underline cursor-pointer hover:text-primary/80 truncate block max-w-full text-start"
            title={t('saveStep.openPath', { path: savedPath })}
          >
            {savedPath}
          </button>
          <button
            type="button"
            onClick={handleRevealInFinder}
            className="text-xs text-muted-foreground hover:text-foreground cursor-pointer mt-0.5"
          >
            {t(revealLabelKey())}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── SaveStep Component ────────────────────────────────────────────────────────

/**
 * Two save modes with genuinely different lifecycles: multi-file waits for an
 * explicit click, single-file auto-opens the OS dialog on mount. They are
 * separate components so each mode's hooks run unconditionally, and so the
 * single-file auto-trigger effect can never fire in multi-file mode.
 */
export function SaveStep(props: SaveStepProps) {
  if (props.multiFileOutputs && props.multiFileOutputs.length > 0) {
    return <MultiFileSave {...props} multiFileOutputs={props.multiFileOutputs} />;
  }
  return <SingleFileSave {...props} />;
}

type MultiFileSaveProps = SaveStepProps & {
  multiFileOutputs: NonNullable<SaveStepProps['multiFileOutputs']>;
};

function MultiFileSave({
  sourceFileName,
  defaultSaveName,
  savedFilePath,
  onDismissSaveConfirmation,
  onSaveComplete,
  onCancel,
  onBack,
  multiFileOutputs,
}: MultiFileSaveProps) {
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
        const message = err instanceof Error ? err.message : t('saveStep.couldNotOpenFolderPicker');
        setError(message);
        setSaveState('error');
        return;
      }

      if (!folderPath) {
        setSaveState('idle');
        toast(t('saveStep.saveCancelled'), { description: t('saveStep.youCanTryAgainAny') });
        onCancel();
        return;
      }

      setSaveState('writing');
      try {
        // Reserve names across the whole batch: nothing is on disk yet, so
        // exists() alone cannot see two outputs claiming the same name.
        const reserved = new Set<string>();
        const renamed: string[] = [];
        for (let i = 0; i < multiFileOutputs.length; i++) {
          const output = multiFileOutputs[i];
          setMultiProgress(t('saveStep.savingProgress', { current: i + 1, total: multiFileOutputs.length }));
          const filePath = await uniqueOutputPath(folderPath, output.fileName, reserved);
          if (!filePath.endsWith(`/${output.fileName}`)) {
            renamed.push(getFileName(filePath));
          }
          // Same coercion the archive needs: what Tauri returned is an
          // ArrayBuffer, whatever the call site's type annotation claims.
          await writeFile(filePath, toBytes(output.bytes));
        }
        if (renamed.length > 0) {
          // Say so rather than leaving the user to notice: they asked for one set
          // of names and got another, even though nothing was destroyed.
          toast(t('save.renamedToAvoidOverwrite', { names: renamed.join(', ') }));
        }
        setMultiProgress(null);
        setSaveState('idle');
        onSaveComplete(folderPath);
      } catch (err) {
        const message = err instanceof Error ? err.message : t('saveStep.couldNotWriteFiles');
        setError(message);
        setMultiProgress(null);
        setSaveState('error');
      }
    } else {
      // ZIP save — create ZIP in memory, then save as file
      setSaveState('writing');
      setMultiProgress(t('saveStep.creatingZip'));

      try {
        const { buildZip } = await import('@/lib/zipOutputs');
        const zipped = buildZip(multiFileOutputs);
        setMultiProgress(null);

        // Open save dialog for the ZIP file
        const zipName = defaultSaveName ?? `${sourceFileName.replace(/\.pdf$/i, '')}-split.zip`;
        let savePath: string | null = null;
        try {
          savePath = await save({
            filters: [{ name: t('filter.zipArchive'), extensions: ['zip'] }],
            defaultPath: zipName,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : t('saveStep.couldNotOpenSaveDialog');
          setError(message);
          setSaveState('error');
          return;
        }

        if (!savePath) {
          setSaveState('idle');
          toast(t('saveStep.saveCancelled'), { description: t('saveStep.youCanTryAgainAny') });
          onCancel();
          return;
        }

        await writeFile(savePath, zipped);
        setSaveState('idle');
        onSaveComplete(savePath);
      } catch (err) {
        const message = err instanceof Error ? err.message : t('saveStep.couldNotCreateZip');
        setError(message);
        setMultiProgress(null);
        setSaveState('error');
      }
    }
  }, [multiFileOutputs, multiSaveMode, defaultSaveName, sourceFileName, onSaveComplete, onCancel]);

  // Show confirmation card when done
  if (savedFilePath && onDismissSaveConfirmation) {
    return (
      <div className="flex flex-1 flex-col">
        <SaveConfirmation savedPath={savedFilePath} onDismiss={onDismissSaveConfirmation} />
        <div className="flex-1" />
        <div className="border-t bg-background px-4 py-3 flex items-center gap-3 flex-none">
          <Button variant="outline" size="sm" onClick={onBack} className="flex-none">
            {t('common.back')}
          </Button>
          <div className="flex-1" />
          <Button size="sm" onClick={handleMultiFileSave}>
            {t('save.again')}
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
            {saveState === 'dialog-open' ? t('saveStep.chooseASaveLocation') : multiProgress ?? t('pdfEditor.saving')}
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
            <p className="text-xs font-medium text-destructive">{t('save.failed')}</p>
            <p className="text-xs text-destructive/80 mt-1">{error}</p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" size="sm" onClick={onBack} className="flex-none">
              {t('common.back')}
            </Button>
            <Button size="sm" onClick={handleMultiFileSave} className="flex-1">
              {t('common.tryAgain')}
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
            {t('save.saveNFiles', { files: plural('count.file', multiFileOutputs.length) })}
          </p>
          <p className="text-xs text-muted-foreground">{t('save.chooseSplitMode')}</p>
        </div>

        <div className="space-y-2">
          {/* The selected destination has to read at a glance: a small radio dot
              against an identical card left users unsure which one they had
              picked, on the screen where the choice is least recoverable. */}
          <label
            data-selected={multiSaveMode === 'folder'}
            className={cn(
              'flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors',
              multiSaveMode === 'folder'
                ? 'border-primary bg-primary/10 ring-1 ring-primary'
                : 'border-border hover:bg-accent/50',
            )}
          >
            <input
              type="radio"
              name="multi-save-mode"
              checked={multiSaveMode === 'folder'}
              onChange={() => setMultiSaveMode('folder')}
              className="accent-primary"
            />
            <div>
              <p className={cn('text-sm font-medium', multiSaveMode === 'folder' ? 'text-primary' : 'text-foreground')}>
                {t('save.toFolder')}
              </p>
              <p className="text-xs text-muted-foreground">{t('save.individualHint')}</p>
            </div>
          </label>
          <label
            data-selected={multiSaveMode === 'zip'}
            className={cn(
              'flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors',
              multiSaveMode === 'zip'
                ? 'border-primary bg-primary/10 ring-1 ring-primary'
                : 'border-border hover:bg-accent/50',
            )}
          >
            <input
              type="radio"
              name="multi-save-mode"
              checked={multiSaveMode === 'zip'}
              onChange={() => setMultiSaveMode('zip')}
              className="accent-primary"
            />
            <div>
              <p className={cn('text-sm font-medium', multiSaveMode === 'zip' ? 'text-primary' : 'text-foreground')}>
                {t('save.asZip')}
              </p>
              <p className="text-xs text-muted-foreground">{t('save.zipHint')}</p>
            </div>
          </label>
        </div>

        <div className="flex gap-3">
          <Button variant="outline" size="sm" onClick={onBack} className="flex-none">
            {t('common.back')}
          </Button>
          <Button size="sm" onClick={handleMultiFileSave} className="flex-1">
            {t('common.save')}
          </Button>
        </div>
      </div>
    </div>
  );
}

function SingleFileSave({
  processedBytes,
  sourceFileName,
  defaultSaveName,
  saveFilters,
  savedFilePath,
  onDismissSaveConfirmation,
  onSaveComplete,
  onCancel,
  onBack,
  sourcePath,
  originPath,
}: SaveStepProps) {
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [error, setError] = useState<string | null>(null);
  // Which of the two the user actually chose, so Save Again and Try Again
  // repeat that instead of falling back to whichever is possible. Choosing
  // Save as... is the choice to leave the original alone; repeating must not
  // quietly overwrite it.
  const [lastMode, setLastMode] = useState<'replace' | 'saveAs' | null>(null);
  // Which fault, not just that there was one. Retrying a replace against a
  // path that no longer holds the file is the one button certain to fail again,
  // so that case is offered the dialog instead.
  const [failure, setFailure] = useState<ReturnType<typeof classifySaveFailure> | null>(null);

  // ── Single-file save (original behavior) ─────────────────────────────────
  const handleSave = useCallback(async () => {
    setLastMode('saveAs');
    setSaveState('dialog-open');
    setError(null);
    setFailure(null);

    // E2E test hook: capture save options without opening the OS dialog.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).__E2E_CAPTURE_SAVE_OPTS__) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window as any).__E2E_CAPTURE_SAVE_OPTS__;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__E2E_SAVE_OPTS__ = {
        options: {
          filters: saveFilters ?? [{ name: t('filter.pdfDocument'), extensions: ['pdf'] }],
          defaultPath: suggestedSavePath(
            originPath ?? sourcePath,
            defaultSaveName ?? buildDefaultSaveName(sourceFileName),
          ),
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
        const message = err instanceof Error ? err.message : t('saveStep.couldNotWriteFile');
        setError(message);
        setSaveState('error');
      }
      return;
    }

    let savePath: string | null = null;
    try {
      savePath = await save({
        filters: saveFilters ?? [{ name: t('filter.pdfDocument'), extensions: ['pdf'] }],
        // Where the document came from, not just what to call it. A bare name
        // leaves the folder to the platform, which on Linux can be the process
        // working directory -- inside the project, under `tauri dev`.
        defaultPath: suggestedSavePath(
          originPath ?? sourcePath,
          defaultSaveName ?? buildDefaultSaveName(sourceFileName),
        ),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : t('saveStep.couldNotOpenSaveDialog');
      setError(message);
      setSaveState('error');
      return;
    }

    if (!savePath) {
      setSaveState('idle');
      toast(t('saveStep.saveCancelled'), { description: t('saveStep.youCanTryAgainAny') });
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
          : t('saveStep.couldNotWriteFileCheck');
      setError(message);
      setSaveState('error');
    }
  }, [processedBytes, sourceFileName, defaultSaveName, saveFilters, originPath, sourcePath, onSaveComplete, onCancel]);

  // Save means the same file, changed -- the meaning it has everywhere else on
  // a desktop, and the one the PDF editor already used. Every tool flow used to
  // open a Save As dialog instead, so unlocking a document left the locked one
  // in place and added a second file beside it.
  // Multi-file output never reaches here: SaveStep hands those to MultiFileSave,
  // which keeps its folder/ZIP save and its collision-safe naming untouched.
  const canReplace = Boolean(sourcePath);

  const handleReplace = useCallback(async () => {
    if (!sourcePath) return;
    setLastMode('replace');
    setSaveState('writing');
    setError(null);
    setFailure(null);
    try {
      // Not writeFile: that opens with O_TRUNC, so the user's only copy is zero
      // bytes from the moment the file opens until the last byte lands.
      await saveOverFile(sourcePath, processedBytes);
      setSaveState('idle');
      onSaveComplete(sourcePath);
    } catch (err) {
      // A Tauri command rejects with a plain string, so `err instanceof Error`
      // is false for every filesystem failure -- which is how all four of these
      // paths came to share one sentence about permissions.
      setFailure(classifySaveFailure(err));
      setError(saveFailureMessage(err, getFileName(sourcePath)));
      setSaveState('error');
    }
  }, [sourcePath, processedBytes, onSaveComplete]);

  // Default to Save as... when nothing has been chosen yet: opening a dialog is
  // the recoverable direction, overwriting is not.
  const repeatSave = lastMode === 'replace' ? handleReplace : handleSave;

  // Auto-trigger the save dialog on mount (only if no savedFilePath yet).
  //
  // Not when the file can simply be replaced: firing the dialog on arrival is
  // what made every flow a Save As, and there would be no way to reach Save.
  //
  // The ref is what keeps it to one dialog. StrictMode mounts, unmounts and
  // mounts again, so this effect runs twice on the same component instance --
  // and `saveState` cannot stop the second run, because it is state that has
  // not re-rendered yet when the second invocation happens. Reported from a real
  // Ubuntu build as two stacked save dialogs; macOS hid it behind an app-modal
  // panel that queues the second one.
  const autoSaveFired = useRef(false);
  useEffect(() => {
    if (autoSaveFired.current) return;
    if (!savedFilePath && !canReplace) {
      autoSaveFired.current = true;
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
            {t('common.back')}
          </Button>
          <div className="flex-1" />
          <Button size="sm" onClick={repeatSave}>
            {t('save.again')}
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
            {saveState === 'dialog-open' ? t('saveStep.chooseASaveLocation') : t('pdfEditor.saving')}
          </p>
          <p className="text-xs text-muted-foreground">
            {saveState === 'writing' ? t('saveStep.writingFile', { name: defaultSaveName ?? buildDefaultSaveName(sourceFileName) }) : ''}
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
            <p className="text-xs font-medium text-destructive">{t('save.failed')}</p>
            <p className="text-xs text-destructive/80 mt-1">{error}</p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" size="sm" onClick={onBack} className="flex-none">
              {t('save.backToCompare')}
            </Button>
            {failure === 'gone' ? (
              // The document is not where it was. Trying the same write again
              // is the one action guaranteed to fail; choosing a place is not.
              <Button size="sm" onClick={handleSave} className="flex-1">
                {t('saveStep.saveAs')}
              </Button>
            ) : (
              <Button size="sm" onClick={repeatSave} className="flex-1">
                {t('common.tryAgain')}
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (canReplace) {
    return (
      <div className="flex flex-1 flex-col">
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="w-full max-w-sm space-y-2 text-center">
            <p className="text-sm font-medium text-foreground">
              {t('saveStep.saveChangesTo', { name: getFileName(sourcePath!) })}
            </p>
            <p className="text-xs text-muted-foreground">
              {t('saveStep.saveReplacesOriginal')}
            </p>
          </div>
        </div>
        <div className="border-t bg-background px-4 py-3 flex items-center gap-3 flex-none">
          <Button variant="outline" size="sm" onClick={onBack} className="flex-none">
            {t('common.back')}
          </Button>
          <div className="flex-1" />
          <Button variant="outline" size="sm" onClick={handleSave}>
            {t('saveStep.saveAs')}
          </Button>
          <Button size="sm" onClick={handleReplace}>
            {t('common.save')}
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
