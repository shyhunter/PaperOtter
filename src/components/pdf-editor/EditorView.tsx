// EditorView: root component for the full-page PDF editor (Phase 16).
// Assembles: EditorProvider > EditorTopToolbar + (left panel | EditorCanvas | right panel).
// Left and right panels are placeholders for future plans.
import { useEffect, useState, useCallback, useRef } from 'react';
import { readFile } from '@tauri-apps/plugin-fs';
import { PDFDocument } from 'pdf-lib';
import {
  EditorProvider,
  useEditorContext,
  createEditorViewState,
} from '@/context/EditorContext';
import { EditorTopToolbar } from './EditorTopToolbar';
import { EditorCanvas } from './EditorCanvas';
import { ZoomToolbar } from './ZoomToolbar';

interface EditorViewProps {
  /** File path to open */
  filePath: string;
}

/** Inner component that consumes EditorContext */
function EditorViewInner({ filePath }: EditorViewProps) {
  const { initState, setFitWidthZoom } = useEditorContext();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const initRef = useRef(false);

  const loadPdf = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const bytes = await readFile(filePath);
      const pdfBytesArray = new Uint8Array(bytes);

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
      setError(err instanceof Error ? err.message : 'Failed to load PDF');
      setIsLoading(false);
    }
  }, [filePath, initState, setFitWidthZoom]);

  useEffect(() => {
    if (!initRef.current) {
      initRef.current = true;
      loadPdf();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
          <span className="text-sm text-muted-foreground">Loading PDF...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-sm text-destructive">{error}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <EditorTopToolbar />

      <div className="flex flex-1 min-h-0">
        {/* Left panel placeholder (future: page panel) */}
        <div className="w-0 flex-none" />

        {/* Center: Canvas with zoom toolbar overlay */}
        <div className="flex-1 relative min-w-0">
          <EditorCanvas />
          <ZoomToolbar />
        </div>

        {/* Right panel placeholder (future: tool sidebar) */}
        <div className="w-0 flex-none" />
      </div>
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
