import { useState, useCallback } from 'react';
import { getExtension } from '@/lib/fileValidation';
import type { ConvertFormat } from '@/types/converter';
import { t } from '@/i18n';
import { FilePickStep } from '@/components/FilePickStep';


/** Maps file extension to ConvertFormat. Returns null if unsupported. */
function extToFormat(ext: string): ConvertFormat | null {
  const map: Record<string, ConvertFormat> = {
    pdf: 'pdf',
    docx: 'docx',
    doc: 'doc',
    odt: 'odt',
    epub: 'epub',
    mobi: 'mobi',
    azw3: 'azw3',
    txt: 'txt',
    rtf: 'rtf',
    html: 'html',
  };
  return map[ext] ?? null;
}

interface ConvertPickStepProps {
  onFilePicked: (filePath: string, format: ConvertFormat) => void;
}

export function ConvertPickStep({ onFilePicked }: ConvertPickStepProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The picker is shared; what a tool does with the path it is handed is not.
  const handleFileReady = useCallback(async (filePath: string) => {
    setIsLoading(true);
    setError(null);
    try {
      if (!filePath || typeof filePath !== 'string') {
        setIsLoading(false);
        return;
      }
      const ext = getExtension(filePath);
      const format = extToFormat(ext);
      if (!format) {
        setError(t('convertDoc.unsupportedFileFormatPleaseUse'));
        setIsLoading(false);
        return;
      }
      onFilePicked(filePath, format);
    } catch (err) {
      const message = err instanceof Error ? err.message : t('app.couldNotOpenFilePicker');
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [onFilePicked]);

  return (
    <FilePickStep
      acceptedFormats={['pdf', 'document']}
      tagline={t('convertDoc.selectADocumentToConvert')}
      onFileReady={handleFileReady}
      isLoading={isLoading}
      error={error}
    />
  );
}
