// EditorView: root component for the full-page PDF editor (Phase 16).
// Assembles: EditorProvider > EditorTopToolbar + (left panel | EditorCanvas | right panel).
// Left and right panels are placeholders for future plans.
import { useEffect, useState, useCallback, useRef } from 'react';
import { readFile } from '@tauri-apps/plugin-fs';
import { PDFDocument } from 'pdf-lib';
import { AlertTriangle, ArrowLeft, Wrench } from 'lucide-react';
import {
  EditorProvider,
  useEditorContext,
  createEditorViewState,
} from '@/context/EditorContext';
import { useToolContext } from '@/context/ToolContext';
import { friendlyPdfError } from '@/lib/pdfUtils';
import { diagLog } from '@/lib/diagLog';
import { Button } from '@/components/ui/button';
import { EditorTopToolbar } from './EditorTopToolbar';
import { EditorCanvas } from './EditorCanvas';
import { CompareFloatingWindow } from './CompareFloatingWindow';
import { ZoomToolbar } from './ZoomToolbar';
import { ToolSidebar } from './ToolSidebar';
import { PagePanel } from './PagePanel';
import { SaveController } from './SaveController';
import { t } from '@/i18n';

interface EditorViewProps {
  /** File path to open */
  filePath: string;
}

/** Inner component that consumes EditorContext */
function EditorViewInner({ filePath }: EditorViewProps) {
  const { state, initState, setFitWidthZoom, scrollToPageRef, markDirty } = useEditorContext();
  const { goToDashboard } = useToolContext();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadedPathRef = useRef<string | null>(null);

  // Track isDirty via ref so event handlers always have the current value
  const isDirtyRef = useRef(false);
  useEffect(() => {
    isDirtyRef.current = state.isDirty;
  });

  // Tauri window close intercept — only block if there are unsaved changes.
  // ALWAYS preventDefault + destroy() — on macOS WKWebView, returning from an
  // async onCloseRequested handler without explicit destroy causes window hang.
  const unlistenCloseRef = useRef<(() => void) | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const win = getCurrentWindow();

        unlistenCloseRef.current?.();
        unlistenCloseRef.current = undefined;

        if (cancelled) return;

        const unlisten = await win.onCloseRequested(async (event) => {
          diagLog(`closeRequested isDirty=${isDirtyRef.current}`);
          event.preventDefault();

          if (!isDirtyRef.current) {
            diagLog('closeRequested.destroy.notDirty');
            await win.destroy();
            return;
          }

          try {
            const { ask } = await import('@tauri-apps/plugin-dialog');
            diagLog('closeRequested.ask.before');
            const confirmed = await ask(
              'You have unsaved changes. Close without saving?',
              { title: t('common.unsavedChanges'), kind: 'warning', okLabel: 'Close', cancelLabel: 'Cancel' },
            );
            diagLog(`closeRequested.ask.after confirmed=${confirmed}`);
            if (confirmed) {
              await win.destroy();
            }
          } catch (err) {
            diagLog(`closeRequested.ask.threw ${err}`);
            await win.destroy();
          }
        });

        if (cancelled) {
          unlisten();
        } else {
          unlistenCloseRef.current = unlisten;
        }
      } catch (err) {
        console.error('[close-guard] Registration error:', err);
      }
    })();

    return () => {
      cancelled = true;
      unlistenCloseRef.current?.();
      unlistenCloseRef.current = undefined;
    };
  }, []);

  /**
   * @param override Bytes to open instead of reading the file, used by repair.
   *                 Everything downstream is identical, so a repaired document
   *                 arrives in exactly the state a healthy one would.
   */
  const loadPdf = useCallback(async (override?: Uint8Array) => {
    setIsLoading(true);
    setError(null);

    try {
      const pdfBytesArray = override ?? new Uint8Array(await readFile(filePath));

      // Get page count
      const doc = await PDFDocument.load(pdfBytesArray, { ignoreEncryption: true });
      const pageCount = doc.getPageCount();

      const fileName = filePath.split('/').pop() ?? filePath.split('\\').pop() ?? 'Untitled.pdf';

      // Initial fit-width zoom — will be refined by ResizeObserver in EditorCanvas
      const initialFitWidth = 1.0;
      setFitWidthZoom(initialFitWidth);

      const viewState = createEditorViewState(
        pdfBytesArray,
        pageCount,
        fileName,
        filePath,
        initialFitWidth,
      );

      initState(viewState);
      setIsLoading(false);
    } catch (err) {
      setError(friendlyPdfError(err));
      setIsLoading(false);
    }
  }, [filePath, initState, setFitWidthZoom]);

  const [isRepairing, setIsRepairing] = useState(false);
  const [repairFailed, setRepairFailed] = useState(false);

  /**
   * Runs the same repair the Repair PDF tool runs, on the file that just failed
   * to open, and carries straight on into the editor if it worked.
   *
   * A PDF that will not open is precisely when repair is wanted and precisely
   * when it is hardest to reach -- the editor is the thing that failed, and
   * getting to the tool meant returning to the dashboard and picking the file
   * again. The result is held in memory and left unsaved: overwriting the
   * original without being asked would destroy the only copy of whatever could
   * not be recovered.
   */
  const tryRepair = useCallback(async () => {
    setIsRepairing(true);
    setRepairFailed(false);

    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const repaired = new Uint8Array(
        await invoke<Uint8Array>('repair_pdf', { sourcePath: filePath }),
      );

      // Ghostscript can exit cleanly and still produce something pdf-lib
      // refuses, so the result has to be opened before it is trusted.
      await PDFDocument.load(repaired, { ignoreEncryption: true });

      await loadPdf(repaired);
      markDirty();
    } catch {
      setRepairFailed(true);
    } finally {
      setIsRepairing(false);
    }
  }, [filePath, loadPdf, markDirty]);

  // Keyed on the path, not a boolean: this component is rendered at a fixed
  // position with no key, so opening a different document changes the prop
  // while React keeps the same instance. A mount-only load meant the new file
  // was picked, accepted, and then silently ignored.
  //
  // The ref still does its original job -- StrictMode invokes effects twice, and
  // this one hands a buffer to pdf.js -- it just remembers which document was
  // loaded rather than merely that one was.
  useEffect(() => {
    if (loadedPathRef.current === filePath) return;
    loadedPathRef.current = filePath;
    loadPdf();
  }, [filePath, loadPdf]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
          <span className="text-sm text-muted-foreground">{t('pdfEditor.loadingPdf')}</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-4 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-6 w-6 text-destructive" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">{t('pdfEditor.unableToOpenFile')}</h2>
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3">
            <p className="text-xs text-destructive">{error}</p>
          </div>
          {repairFailed && (
            <p className="text-xs text-muted-foreground">
              {t('editorView.couldNotBeRepaired')}
            </p>
          )}

          <Button onClick={tryRepair} disabled={isRepairing} className="w-full">
            <Wrench className="h-4 w-4 me-2" />
            {isRepairing ? t('repairPdf.repairing') : t('editorView.tryToRepair')}
          </Button>

          <Button onClick={goToDashboard} variant="outline" className="w-full">
            <ArrowLeft className="h-4 w-4 me-2" />
            {t('pdfEditor.backToDashboard')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 relative">
      <SaveController />
      <EditorTopToolbar />

      <div className="flex flex-1 min-h-0">
        {/* Left: Page panel with thumbnails */}
        <PagePanel onScrollToPage={(idx) => scrollToPageRef.current?.(idx)} />

        {/* Center: Canvas with zoom toolbar overlay.
            flex flex-col is required so EditorCanvas (flex-1 overflow-auto)
            fills the column height and scrolls internally, keeping the
            header and side panels fixed in place during PDF scroll. */}
        <div className="flex-1 relative min-w-0 flex flex-col">
          <EditorCanvas />
          <ZoomToolbar />
        </div>

        {/* Right: Tool sidebar */}
        <ToolSidebar />
      </div>

      {/* Full-screen comparison overlay */}
      {state.compareMode !== 'off' && <CompareFloatingWindow />}
    </div>
  );
}

/** Public component — wraps in EditorProvider */
export function EditorView({ filePath }: EditorViewProps) {
  return (
    <EditorProvider>
      <EditorViewInner filePath={filePath} />
    </EditorProvider>
  );
}
