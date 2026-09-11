// MergePickStep: Multi-file PDF selector with thumbnails, page counts, and "Add More".
import { useState, useCallback } from 'react';
import { FilePlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { loadPdfForMerge } from '@/lib/pdfMerge';
import { renderPdfThumbnail } from '@/lib/pdfThumbnail';
import { friendlyPdfError } from '@/lib/pdfUtils';
import type { MergeInput } from '@/lib/pdfMerge';
import { plural, t } from '@/i18n';
import { OtterSpinner } from '@/components/brand/OtterSpinner';
import { FilePickStep } from '@/components/FilePickStep';
import { openFilePicker } from '@/hooks/useFileOpen';

interface FileWithThumb extends MergeInput {
  thumbnailUrl: string;
}

interface MergePickStepProps {
  onFilesSelected: (files: MergeInput[]) => void;
}

export function MergePickStep({ onFilesSelected }: MergePickStepProps) {
  const [files, setFiles] = useState<FileWithThumb[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  /** Returns what it managed to load, so a caller can act on success only. */
  const addFiles = useCallback(async (filePaths: string[]): Promise<FileWithThumb[]> => {
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
      return newFiles;
    } catch (err) {
      setLoadError(friendlyPdfError(err));
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  /** The shared picker hands over one path plus the rest of the selection. */
  const handleFileReady = useCallback(
    (filePath: string, alsoSelected: string[]) => { void addFiles([filePath, ...alsoSelected]); },
    [addFiles],
  );

  /** The Add more button, once the list exists. Same dialog the picker opens. */
  const handleAddMore = useCallback(async () => {
    try {
      const picked = await openFilePicker(['pdf'], true);
      if (!picked) return;
      await addFiles(Array.isArray(picked) ? picked : [picked]);
    } catch {
      setLoadError(t('app.couldNotOpenFilePicker'));
    }
  }, [addFiles]);

  const handleRemove = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleContinue = useCallback(() => {
    onFilesSelected(files);
  }, [files, onFilesSelected]);

  // Until something is staged this is a pick screen like every other tool's,
  // drop target and guards included. Once files are in, it becomes the list --
  // which is the part merge actually needs and no shared card can express.
  if (files.length === 0) {
    return (
      <FilePickStep
        acceptedFormats={['pdf']}
        tagline={t('merge.selectTwoOrMorePdfs')}
        onFileReady={handleFileReady}
        multiple
        isLoading={isLoading}
        error={loadError}
      />
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center p-6">
      <div className="w-full max-w-lg space-y-4">
        <div className="text-center space-y-1">
          <h2 className="text-lg font-semibold text-foreground">{t('merge.mergePdfs')}</h2>
          <p className="text-sm text-muted-foreground">{t('merge.selectTwoOrMorePdfs')}</p>
        </div>

        {/* File list */}
        {files.length > 0 && (
          <div className="rounded-lg border border-border bg-card overflow-y-auto max-h-64">
            {files.map((file, i) => (
              <div key={`${file.filePath}-${i}`} className="flex items-center gap-3 px-3 py-2 border-b border-border last:border-b-0">
                <img
                  src={file.thumbnailUrl}
                  alt={t('merge.pageOneOf', { name: file.fileName })}
                  className="w-10 h-12 object-cover rounded border border-border flex-none"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">{file.fileName}</p>
                  <p className="text-xs text-muted-foreground">{plural('count.page', file.pageCount)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemove(i)}
                  className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors flex-none"
                  aria-label={t('common.removeNamed', { name: file.fileName })}
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
            <OtterSpinner className="size-4" />
            <span className="text-sm text-muted-foreground">{t('merge.loadingPdfs')}</span>
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
            onClick={handleAddMore}
            disabled={isLoading}
            className="flex-1"
          >
            <FilePlus className="w-4 h-4 me-2" />
            {files.length === 0 ? t('mergePickStep.selectPdfs') : t('mergePickStep.addMore')}
          </Button>

          <Button
            onClick={handleContinue}
            disabled={files.length < 2 || isLoading}
            className="flex-1"
          >
            {t('jpgToPdf.continue')}
          </Button>
        </div>

        {files.length === 1 && (
          <p className="text-xs text-muted-foreground text-center">{t('merge.addAtLeastOneMore')}</p>
        )}
      </div>
    </div>
  );
}
