// SplitPickStep: Single-file PDF picker for the split tool.
import { useState, useCallback, useEffect } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { readFile } from '@tauri-apps/plugin-fs';
import { PDFDocument } from 'pdf-lib';
import { FileUp, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SplitPickStepProps {
  onFileLoaded: (pdfBytes: Uint8Array, pageCount: number, fileName: string) => void;
  initialFile?: string | null;
}

export function SplitPickStep({ onFileLoaded, initialFile }: SplitPickStepProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFile = useCallback(async (filePath: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const bytes = await readFile(filePath);
      const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const pageCount = doc.getPageCount();
      const fileName = filePath.split('/').pop() ?? filePath.split('\\').pop() ?? filePath;
      onFileLoaded(bytes, pageCount, fileName);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load PDF.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [onFileLoaded]);

  // Auto-load initial file on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (initialFile) {
      loadFile(initialFile);
    }
  }, []);

  const handleSelectFile = useCallback(async () => {
    try {
      const result = await open({
        multiple: false,
        filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
      });
      if (!result) return;
      const path = typeof result === 'string' ? result : result;
      await loadFile(path);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not open file picker.';
      setError(message);
    }
  }, [loadFile]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-4 text-center">
        <h2 className="text-lg font-semibold text-foreground">Split PDF</h2>
        <p className="text-sm text-muted-foreground">Select a PDF to split into multiple files.</p>

        {error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3">
            <p className="text-xs text-destructive">{error}</p>
          </div>
        )}

        <Button onClick={handleSelectFile} disabled={isLoading} className="w-full">
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Loading…
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
  );
}
