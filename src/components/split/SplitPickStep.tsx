// SplitPickStep: Single-file PDF picker for the split tool.
import { useState, useCallback } from 'react';
import { getFileName } from '@/lib/fileValidation';
import { readFile } from '@tauri-apps/plugin-fs';
import { encryptedPdfRefusal } from '@/lib/pdfEncryption';
import { PDFDocument } from 'pdf-lib';
import { friendlyPdfError } from '@/lib/pdfUtils';
import { FilePickStep } from '@/components/FilePickStep';
import { t } from '@/i18n';

interface SplitPickStepProps {
  onFileLoaded: (pdfBytes: Uint8Array, pageCount: number, fileName: string) => void;
}

export function SplitPickStep({ onFileLoaded }: SplitPickStepProps) {
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

  return (
    <FilePickStep
      acceptedFormats={['pdf']}
      tagline={t('split.selectAPdfToSplit')}
      onFileReady={loadFile}
      isLoading={isLoading}
      error={error}
    />
  );
}
