// EditPdfFlow: Pick PDF -> Edit -> Save flow for the Edit PDF tool.
// Step 0: Pick a PDF file
// Step 1: Edit in EditorLayout (three-panel layout)
// Step 2: Save edited PDF
import { useState, useCallback, useRef, useEffect } from 'react';
import { readFile } from '@tauri-apps/plugin-fs';
import { open } from '@tauri-apps/plugin-dialog';
import { FileUp, Loader2 } from 'lucide-react';
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
  }));

  return {
    pdfBytes,
    pages,
    currentPage: 0,
    isDirty: false,
  };
}

export function EditPdfFlow() {
  const { pendingFiles, setPendingFiles } = useToolContext();
  const [step, setStep] = useState(0);
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
      setStep(1);
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

  const handleSave = useCallback(() => {
    // For now, save the original bytes (editing functionality added in Plans 04/05)
    setStep(2);
  }, []);

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
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Save button bar */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-background">
              <span className="text-xs text-muted-foreground">
                {fileName} -- {pageCount} page{pageCount !== 1 ? 's' : ''}
              </span>
              <Button size="sm" onClick={handleSave}>
                Save
              </Button>
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
            onCancel={() => setStep(1)}
            onBack={() => {
              setSavedFilePath(null);
              setStep(1);
            }}
          />
        )}
      </StepErrorBoundary>
    </>
  );
}
