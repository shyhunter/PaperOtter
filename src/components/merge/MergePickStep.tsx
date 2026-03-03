// MergePickStep: Multi-file PDF selector with thumbnails, page counts, and "Add More".
import { useState, useCallback } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { FilePlus, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { loadPdfForMerge } from '@/lib/pdfMerge';
import { renderPdfThumbnail } from '@/lib/pdfThumbnail';
import type { MergeInput } from '@/lib/pdfMerge';

interface FileWithThumb extends MergeInput {
  thumbnailUrl: string;
}

interface MergePickStepProps {
  onFilesSelected: (files: MergeInput[]) => void;
  /** Optional initial file path (from dashboard drop) */
  initialFile?: string | null;
}

export function MergePickStep({ onFilesSelected, initialFile }: MergePickStepProps) {
  const [files, setFiles] = useState<FileWithThumb[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const addFiles = useCallback(async (filePaths: string[]) => {
    setIsLoading(true);
    setLoadError(null);

    try {
      const newFiles: FileWithThumb[] = [];
      for (const path of filePaths) {
        const input = await loadPdfForMerge(path);
        const thumbnailUrl = await renderPdfThumbnail(input.bytes, 0.3);
        newFiles.push({ ...input, thumbnailUrl });
      }
      setFiles((prev) => [...prev, ...newFiles]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load PDF.';
      setLoadError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load initial file on first render if provided
  useState(() => {
    if (initialFile) {
      addFiles([initialFile]);
    }
  });

  const handleSelectFiles = useCallback(async () => {
    try {
      const result = await open({
        multiple: true,
        filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
      });

      if (!result) return; // user cancelled

      const paths = Array.isArray(result) ? result : [result];
      await addFiles(paths);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not open file picker.';
      setLoadError(message);
    }
  }, [addFiles]);

  const handleRemove = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleContinue = useCallback(() => {
    onFilesSelected(files);
  }, [files, onFilesSelected]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center p-6">
      <div className="w-full max-w-lg space-y-4">
        <div className="text-center space-y-1">
          <h2 className="text-lg font-semibold text-foreground">Merge PDFs</h2>
          <p className="text-sm text-muted-foreground">Select two or more PDFs to combine into one.</p>
        </div>

        {/* File list */}
        {files.length > 0 && (
          <div className="rounded-lg border border-border bg-card overflow-y-auto max-h-64">
            {files.map((file, i) => (
              <div key={`${file.filePath}-${i}`} className="flex items-center gap-3 px-3 py-2 border-b border-border last:border-b-0">
                <img
                  src={file.thumbnailUrl}
                  alt={`Page 1 of ${file.fileName}`}
                  className="w-10 h-12 object-cover rounded border border-border flex-none"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">{file.fileName}</p>
                  <p className="text-xs text-muted-foreground">{file.pageCount} page{file.pageCount !== 1 ? 's' : ''}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemove(i)}
                  className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors flex-none"
                  aria-label={`Remove ${file.fileName}`}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Loading indicator */}
        {isLoading && (
          <div className="flex items-center justify-center gap-2 py-4">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Loading PDFs…</span>
          </div>
        )}

        {/* Error */}
        {loadError && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3">
            <p className="text-xs text-destructive">{loadError}</p>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={handleSelectFiles}
            disabled={isLoading}
            className="flex-1"
          >
            <FilePlus className="w-4 h-4 mr-2" />
            {files.length === 0 ? 'Select PDFs' : 'Add More'}
          </Button>

          <Button
            onClick={handleContinue}
            disabled={files.length < 2 || isLoading}
            className="flex-1"
          >
            Continue
          </Button>
        </div>

        {files.length === 1 && (
          <p className="text-xs text-muted-foreground text-center">Add at least one more PDF to merge.</p>
        )}
      </div>
    </div>
  );
}
