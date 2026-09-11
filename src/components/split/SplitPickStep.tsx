// SplitPickStep: Single-file PDF picker for the split tool.
import { useState, useCallback, useEffect } from 'react';
import { getFileName } from '@/lib/fileValidation';
import { open } from '@/lib/dialog';
import { readFile } from '@tauri-apps/plugin-fs';
import { encryptedPdfRefusal } from '@/lib/pdfEncryption';
import { PDFDocument } from 'pdf-lib';
import { FileUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { friendlyPdfError } from '@/lib/pdfUtils';
import { t } from '@/i18n';
import { OtterSpinner } from '@/components/brand/OtterSpinner';

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
      // A locked PDF loads fine under `ignoreEncryption` and reports its real
      // page count, so without this the tool opens and then renders nothing.
      const refusal = await encryptedPdfRefusal(bytes);
      if (refusal) { setError(refusal); return; }
      const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const pageCount = doc.getPageCount();
      const fileName = getFileName(filePath);
      onFileLoaded(bytes, pageCount, fileName);
    } catch (err) {
      setError(friendlyPdfError(err));
    } finally {
      setIsLoading(false);
    }
  }, [onFileLoaded]);

  // Auto-load initial file on mount

  useEffect(() => {
    if (initialFile) {
      loadFile(initialFile);
    }
  }, [initialFile, loadFile]);

  const handleSelectFile = useCallback(async () => {
    try {
      const result = await open({
        multiple: false,
        filters: [{ name: t('filter.pdfFiles'), extensions: ['pdf'] }],
      });
      if (!result) return;
      const path = typeof result === 'string' ? result : result;
      await loadFile(path);
    } catch (err) {
      const message = err instanceof Error ? err.message : t('app.couldNotOpenFilePicker');
      setError(message);
    }
  }, [loadFile]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-4 text-center">
        <h2 className="text-lg font-semibold text-foreground">{t('split.splitPdf')}</h2>
        <p className="text-sm text-muted-foreground">{t('split.selectAPdfToSplit')}</p>

        {error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3">
            <p className="text-xs text-destructive">{error}</p>
          </div>
        )}

        <Button data-testid="open-file-btn" onClick={handleSelectFile} disabled={isLoading} className="w-full">
          {isLoading ? (
            <>
              <OtterSpinner className="size-4" />
              {t('common.loading')}
            </>
          ) : (
            <>
              <FileUp className="w-4 h-4 me-2" />
              {t('pdfToJpg.selectPdf')}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
