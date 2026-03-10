// EditPdfFlow: Pick PDF -> Edit -> Save flow for the Edit PDF tool.
// Step 0: Pick a PDF file
// Step 1: Edit in EditorLayout (three-panel layout)
// Step 2: Save edited PDF
import { useState, useCallback, useRef, useEffect } from 'react';
import { readFile } from '@tauri-apps/plugin-fs';
import { open } from '@tauri-apps/plugin-dialog';
import { FileUp, Loader2, Save } from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import { SaveStep } from '@/components/SaveStep';
import { StepErrorBoundary } from '@/components/ErrorBoundary';
import { Button } from '@/components/ui/button';
import { useToolContext } from '@/context/ToolContext';
import { EditorLayout } from './EditorLayout';
import type { EditorState, PageEditState } from '@/types/editor';

function buildInitialEditorState(pdfBytes: Uint8Array, pageCount: number): EditorState {
  const pages: PageEditState[] = Array.from({ length: pageCount }, (_, i) => ({
    pageIndex: i,
    textBlocks: [],
    imageBlocks: [],
    deletedTextIds: [],
    deletedImageIds: [],
    deletedTextBlocks: [],
    deletedImageBlocks: [],
  }));

  return {
    pdfBytes,
    pages,
    currentPage: 0,
    isDirty: false,
  };
}

interface EditPdfFlowProps {
  onStepChange?: (step: number) => void;
}

export function EditPdfFlow({ onStepChange }: EditPdfFlowProps) {
  const { pendingFiles, setPendingFiles } = useToolContext();
  const [step, setStep] = useState(0);

  const goToStep = useCallback((s: number) => {
    setStep(s);
    onStepChange?.(s);
  }, [onStepChange]);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [filePath, setFilePath] = useState('');
  const [fileName, setFileName] = useState('');
  const [pageCount, setPageCount] = useState(1);
  const [currentPage, setCurrentPage] = useState(0);
  const [editorState, setEditorState] = useState<EditorState | null>(null);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savedFilePath, setSavedFilePath] = useState<string | null>(null);

  // StrictMode guard for pendingFiles consumption
  const consumedRef = useRef(false);
  const initialFile = pendingFiles.length > 0 ? pendingFiles[0] : null;
  if (pendingFiles.length > 0 && !consumedRef.current) {
    consumedRef.current = true;
    setPendingFiles([]);
  }

  const loadFile = useCallback(async (filePath: string) => {
    setIsLoadingFile(true);
    setLoadError(null);
    try {
      const bytes = await readFile(filePath);
      const name = filePath.split('/').pop() ?? filePath.split('\\').pop() ?? filePath;

      // Get page count from pdf-lib
      const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const count = doc.getPageCount();

      const pdfBytesArray = new Uint8Array(bytes);
      setPdfBytes(pdfBytesArray);
      setFilePath(filePath);
      setFileName(name);
      setPageCount(count);
      setCurrentPage(0);
      setEditorState(buildInitialEditorState(pdfBytesArray, count));
      goToStep(1);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load PDF.';
      setLoadError(message);
    } finally {
      setIsLoadingFile(false);
    }
  }, []);

  // Auto-load pending file from dashboard drop
  useEffect(() => {
    if (initialFile) loadFile(initialFile);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectFile = useCallback(async () => {
    try {
      const result = await open({
        multiple: false,
        filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
      });
      if (!result) return;
      await loadFile(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not open file picker.';
      setLoadError(message);
    }
  }, [loadFile]);

  const handlePageChange = useCallback((pageIndex: number) => {
    setCurrentPage(pageIndex);
    setEditorState((prev) => prev ? { ...prev, currentPage: pageIndex } : prev);
  }, []);

  const handleEditorStateChange = useCallback((newState: EditorState) => {
    setEditorState(newState);
  }, []);

  // Warn before leaving with unsaved changes
  const isDirty = editorState?.isDirty ?? false;
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const handleSave = useCallback(async () => {
    if (!pdfBytes || !editorState) return;

    if (editorState.isDirty) {
      // Apply all text and image edits before saving
      const { applyAllEdits } = await import('@/lib/pdfEditor');
      const editedPdf = await applyAllEdits(pdfBytes, editorState.pages);
      setPdfBytes(new Uint8Array(editedPdf));
    }

    goToStep(2);
  }, [pdfBytes, editorState, goToStep]);

  return (
    <>
      <StepErrorBoundary stepName="Edit PDF">
        {/* Step 0: Pick file */}
        {step === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center p-6">
            <div className="w-full max-w-sm space-y-4 text-center">
              <h2 className="text-lg font-semibold text-foreground">Edit PDF</h2>
              <p className="text-sm text-muted-foreground">
                Select a PDF to edit text and images.
              </p>
              {loadError && (
                <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3">
                  <p className="text-xs text-destructive">{loadError}</p>
                </div>
              )}
              <Button onClick={handleSelectFile} disabled={isLoadingFile} className="w-full">
                {isLoadingFile ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Loading...
                  </>
                ) : (
                  <>
                    <FileUp className="w-4 h-4 mr-2" />
                    Select PDF
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Step 1: Editor */}
        {step === 1 && pdfBytes && editorState && (
          <div className="flex flex-1 flex-col overflow-hidden relative">
            {/* Top info bar */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-background">
              <span className="text-xs text-muted-foreground">
                {fileName} -- {pageCount} page{pageCount !== 1 ? 's' : ''}
              </span>
              {editorState.isDirty && (
                <span className="text-xs text-amber-600 font-medium">Unsaved changes</span>
              )}
            </div>
            <EditorLayout
              pdfBytes={pdfBytes}
              filePath={filePath}
              pageCount={pageCount}
              currentPage={currentPage}
              onPageChange={handlePageChange}
              editorState={editorState}
              onEditorStateChange={handleEditorStateChange}
            />
            {/* Floating Save button — prominent, always visible like iLovePDF */}
            <Button
              size="lg"
              onClick={handleSave}
              className="absolute bottom-6 right-6 z-50 shadow-lg px-6 py-3 text-base font-semibold gap-2 rounded-full"
            >
              <Save className="w-5 h-5" />
              Save changes
            </Button>
          </div>
        )}

        {/* Step 2: Save */}
        {step === 2 && pdfBytes && (
          <SaveStep
            processedBytes={pdfBytes}
            sourceFileName={fileName}
            defaultSaveName={fileName.replace(/\.pdf$/i, '') + '-edited.pdf'}
            savedFilePath={savedFilePath}
            onDismissSaveConfirmation={() => setSavedFilePath(null)}
            onSaveComplete={(path) => setSavedFilePath(path)}
            onCancel={() => goToStep(1)}
            onBack={() => {
              setSavedFilePath(null);
              goToStep(1);
            }}
          />
        )}
      </StepErrorBoundary>
    </>
  );
}
