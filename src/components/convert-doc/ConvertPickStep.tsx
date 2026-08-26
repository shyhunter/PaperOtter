import { useState, useCallback } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { FileUp, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getExtension } from '@/lib/fileValidation';
import type { ConvertFormat } from '@/types/converter';
import { t } from '@/i18n';

const DOC_EXTENSIONS = [
  'pdf', 'docx', 'doc', 'odt', 'epub', 'mobi', 'azw3', 'txt', 'rtf', 'html',
];

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

  const handleSelectFile = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await open({
        multiple: false,
        filters: [{ name: t('filter.documentFiles'), extensions: DOC_EXTENSIONS }],
      });
      if (!result || typeof result !== 'string') {
        setIsLoading(false);
        return;
      }
      const ext = getExtension(result);
      const format = extToFormat(ext);
      if (!format) {
        setError(t('convertDoc.unsupportedFileFormatPleaseUse'));
        setIsLoading(false);
        return;
      }
      onFilePicked(result, format);
    } catch (err) {
      const message = err instanceof Error ? err.message : t('app.couldNotOpenFilePicker');
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [onFilePicked]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-4 text-center">
        <h2 className="text-lg font-semibold text-foreground">{t('convertDoc.convertDocument')}</h2>
        <p className="text-sm text-muted-foreground">
          {t('convertDoc.selectADocumentToConvert')}
        </p>
        <p className="text-xs text-muted-foreground">
          {t('convertDoc.openPdfDocxDocOdt')}
        </p>
        <p className="text-xs text-muted-foreground">
          {t('convertDoc.convertToMarkdownHtmlJson')}
        </p>

        {error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3">
            <p className="text-xs text-destructive">{error}</p>
          </div>
        )}

        <Button onClick={handleSelectFile} disabled={isLoading} className="w-full">
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 me-2 animate-spin" />
              {t('common.loading')}
            </>
          ) : (
            <>
              <FileUp className="w-4 h-4 me-2" />
              {t('convertDoc.selectDocument')}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
