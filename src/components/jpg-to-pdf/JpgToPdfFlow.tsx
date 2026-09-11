// JpgToPdfFlow: Pick images -> Configure page layout -> Create & Save PDF.
import { useState, useCallback, useEffect, useRef } from 'react';
import { getFileName } from '@/lib/fileValidation';
import { readImageBytes } from '@/lib/imageInput';
import { open } from '@/lib/dialog';
import { PDFDocument } from 'pdf-lib';
import { FilePlus, X, ArrowUp, ArrowDown } from 'lucide-react';
import { SaveStep } from '@/components/SaveStep';
import { StepErrorBoundary } from '@/components/ErrorBoundary';
import { Button } from '@/components/ui/button';
import { useToolContext } from '@/context/ToolContext';
import { cn } from '@/lib/utils';
import { plural, t } from '@/i18n';
import { OtterSpinner } from '@/components/brand/OtterSpinner';
import { PRIMARY_ACTION } from '@/components/ui/primaryAction';

// ── Constants ───────────────────────────────────────────────────────────────

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'];

type PageSizeId = 'a4' | 'letter' | 'auto';
type OrientationId = 'portrait' | 'landscape' | 'auto';
type MarginId = 'none' | 'small' | 'medium';

const PAGE_SIZES: Record<Exclude<PageSizeId, 'auto'>, [number, number]> = {
  a4: [595.28, 841.89],
  letter: [612, 792],
};

function pageSizeLabel(id: PageSizeId): string {
  const labels: Record<PageSizeId, string> = {
    a4: 'A4',
    letter: t('configureStep.letter'),
    auto: t('jpgToPdfFlow.autoFit'),
  };
  return labels[id];
}

function orientationLabel(id: OrientationId): string {
  const labels: Record<OrientationId, string> = {
    portrait: t('jpgToPdfFlow.portrait'),
    landscape: t('jpgToPdfFlow.landscape'),
    auto: t('jpgToPdfFlow.auto'),
  };
  return labels[id];
}

const MARGIN_VALUES: Record<MarginId, number> = {
  none: 0,
  small: 28.35,  // ~10mm in points
  medium: 56.69, // ~20mm in points
};

function marginLabel(id: MarginId): string {
  const labels: Record<MarginId, string> = {
    none: t('cropPdfFlow.none'),
    small: t('jpgToPdfFlow.small10mm'),
    medium: t('jpgToPdfFlow.medium20mm'),
  };
  return labels[id];
}

// ── Types ───────────────────────────────────────────────────────────────────

interface ImageEntry {
  filePath: string;
  fileName: string;
  thumbnailUrl: string;
  naturalWidth: number;
  naturalHeight: number;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Convert any image bytes to a supported format for pdf-lib.
 * pdf-lib only supports JPEG and PNG natively, so WebP (and any other format)
 * gets converted to PNG via canvas.
 */
async function convertToSupportedFormat(
  bytes: Uint8Array,
  ext: string,
): Promise<{ bytes: Uint8Array; format: 'jpeg' | 'png' }> {
  if (ext === 'jpg' || ext === 'jpeg') {
    return { bytes, format: 'jpeg' };
  }
  if (ext === 'png') {
    return { bytes, format: 'png' };
  }

  // WebP or any other format — convert to PNG via canvas
  const blob = new Blob([bytes]);
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const pngBlob = await new Promise<Blob>((resolve) =>
    canvas.toBlob((b) => resolve(b!), 'image/png'),
  );
  return { bytes: new Uint8Array(await pngBlob.arrayBuffer()), format: 'png' };
}

/**
 * Create a small thumbnail data URL from image bytes for the file list.
 */
async function createThumbnail(bytes: Uint8Array): Promise<{ url: string; width: number; height: number }> {
  const blob = new Blob([bytes]);
  const bitmap = await createImageBitmap(blob);
  const { width, height } = bitmap;

  // Scale down to max 96px for thumbnail
  const scale = Math.min(96 / width, 96 / height, 1);
  const tw = Math.round(width * scale);
  const th = Math.round(height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0, tw, th);
  bitmap.close();

  return { url: canvas.toDataURL(), width, height };
}

// ── Component ───────────────────────────────────────────────────────────────

interface JpgToPdfFlowProps {
  onStepChange?: (step: number) => void;
}

export function JpgToPdfFlow({ onStepChange }: JpgToPdfFlowProps) {
  const { pendingFiles, setPendingFiles } = useToolContext();
  const [step, setStep] = useState(0);

  const goToStep = useCallback((s: number) => {
    setStep(s);
    onStepChange?.(s);
  }, [onStepChange]);
  const [images, setImages] = useState<ImageEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Configure options
  const [pageSize, setPageSize] = useState<PageSizeId>('a4');
  const [orientation, setOrientation] = useState<OrientationId>('auto');
  const [margin, setMargin] = useState<MarginId>('small');

  // Processing + Save
  const [isProcessing, setIsProcessing] = useState(false);
  const [processError, setProcessError] = useState<string | null>(null);
  const [resultBytes, setResultBytes] = useState<Uint8Array | null>(null);
  const [savedFilePath, setSavedFilePath] = useState<string | null>(null);

  // StrictMode guard
  const consumedPending = useRef(false);

  // Consume pending files on mount
  // Captured into a ref on the first render, never recomputed. StrictMode renders
  // twice; deriving this from `consumedPending` — which the first pass flips —
  // left the second pass with an empty list, and the mount effect closes over the
  // second pass. That is why a dropped image never opened.
  const capturedPending = useRef<string[] | null>(null);
  if (capturedPending.current === null && pendingFiles.length > 0) {
    capturedPending.current = [...pendingFiles];
  }
  const initialFiles = capturedPending.current ?? [];
  if (!consumedPending.current && pendingFiles.length > 0) {
    consumedPending.current = true;
    setPendingFiles([]);
  }

  // ── Add images ────────────────────────────────────────────────────────────

  /** Returns what it managed to load, so a caller can act on success only. */
  const addImages = useCallback(async (filePaths: string[]): Promise<ImageEntry[]> => {
    setIsLoading(true);
    setLoadError(null);

    try {
      const newEntries: ImageEntry[] = [];
      for (const path of filePaths) {
        // A HEIC comes back as PNG — the webview cannot decode HEIC itself.
        const { bytes } = await readImageBytes(path);
        const { url, width, height } = await createThumbnail(bytes);
        newEntries.push({
          filePath: path,
          fileName: getFileName(path),
          thumbnailUrl: url,
          naturalWidth: width,
          naturalHeight: height,
        });
      }
      setImages((prev) => [...prev, ...newEntries]);
      return newEntries;
    } catch (err) {
      const message = err instanceof Error ? err.message : t('convertImageFlow.failedToLoadImage');
      setLoadError(message);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Auto-load initial files
  const initialFilesLoaded = useRef(false);
  useEffect(() => {
    if (!initialFilesLoaded.current && initialFiles.length > 0) {
      initialFilesLoaded.current = true;
      // Load them, but stay on this step. It is where the user sees what is
      // selected, reorders it, and — the common case — adds a second image.
      // Skipping ahead would take that away for the sake of one click.
      void addImages(initialFiles);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectFiles = useCallback(async () => {
    try {
      const result = await open({
        multiple: true,
        filters: [{ name: t('filter.imageFiles'), extensions: IMAGE_EXTENSIONS }],
      });
      if (!result) return;
      const paths = Array.isArray(result) ? result : [result];
      await addImages(paths);
    } catch (err) {
      const message = err instanceof Error ? err.message : t('app.couldNotOpenFilePicker');
      setLoadError(message);
    }
  }, [addImages]);

  const handleRemove = useCallback((index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleMoveUp = useCallback((index: number) => {
    if (index === 0) return;
    setImages((prev) => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
  }, []);

  const handleMoveDown = useCallback((index: number) => {
    setImages((prev) => {
      if (index >= prev.length - 1) return prev;
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next;
    });
  }, []);

  const handleContinue = useCallback(() => {
    goToStep(1);
  }, [goToStep]);

  // ── Create PDF ────────────────────────────────────────────────────────────

  const handleCreatePdf = useCallback(async () => {
    setIsProcessing(true);
    setProcessError(null);

    try {
      const pdfDoc = await PDFDocument.create();
      const marginPt = MARGIN_VALUES[margin];

      for (const img of images) {
        // Read and convert image
        const { bytes: rawBytes, mime } = await readImageBytes(img.filePath);
        // Derive the format from the bytes we actually hold, not from the path:
        // a .heic has already been decoded to PNG by this point.
        const ext = mime.replace('image/', '');
        const { bytes: imgBytes, format } = await convertToSupportedFormat(rawBytes, ext);

        let embeddedImage;
        if (format === 'png') {
          embeddedImage = await pdfDoc.embedPng(imgBytes);
        } else {
          embeddedImage = await pdfDoc.embedJpg(imgBytes);
        }

        const imgW = embeddedImage.width;
        const imgH = embeddedImage.height;

        // Determine page dimensions
        let pageW: number;
        let pageH: number;

        if (pageSize === 'auto') {
          // Auto-fit: page = image dimensions + margins
          pageW = imgW + marginPt * 2;
          pageH = imgH + marginPt * 2;
        } else {
          const [baseW, baseH] = PAGE_SIZES[pageSize];

          if (orientation === 'auto') {
            // Auto orientation: match image aspect ratio
            const imgIsLandscape = imgW > imgH;
            if (imgIsLandscape) {
              pageW = Math.max(baseW, baseH);
              pageH = Math.min(baseW, baseH);
            } else {
              pageW = Math.min(baseW, baseH);
              pageH = Math.max(baseW, baseH);
            }
          } else if (orientation === 'landscape') {
            pageW = Math.max(baseW, baseH);
            pageH = Math.min(baseW, baseH);
          } else {
            // portrait
            pageW = Math.min(baseW, baseH);
            pageH = Math.max(baseW, baseH);
          }
        }

        const page = pdfDoc.addPage([pageW, pageH]);

        // Calculate drawable area (inside margins)
        const drawW = pageW - marginPt * 2;
        const drawH = pageH - marginPt * 2;

        // Scale image to fit within drawable area while maintaining aspect ratio
        const scaleX = drawW / imgW;
        const scaleY = drawH / imgH;
        const scale = Math.min(scaleX, scaleY, pageSize === 'auto' ? 1 : Infinity);

        const scaledW = imgW * scale;
        const scaledH = imgH * scale;

        // Center image within the drawable area
        const x = marginPt + (drawW - scaledW) / 2;
        const y = marginPt + (drawH - scaledH) / 2;

        page.drawImage(embeddedImage, {
          x,
          y,
          width: scaledW,
          height: scaledH,
        });
      }

      const pdfBytes = await pdfDoc.save();
      setResultBytes(new Uint8Array(pdfBytes));
      goToStep(2);
    } catch (err) {
      const message = err instanceof Error ? err.message : t('jpgToPdfFlow.failedToCreatePdf');
      setProcessError(message);
    } finally {
      setIsProcessing(false);
    }
  }, [images, pageSize, orientation, margin, goToStep]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <StepErrorBoundary stepName="JPG to PDF">
        {/* Step 0: Pick images */}
        {step === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center p-6">
            <div className="w-full max-w-lg space-y-4">
              <div className="text-center space-y-1">
                <h2 className="text-lg font-semibold text-foreground">{t('jpgToPdf.jpgToPdf')}</h2>
                <p className="text-sm text-muted-foreground">
                  {t('jpgToPdf.selectOneOrMoreImages')}
                </p>
              </div>

              {/* File list */}
              {images.length > 0 && (
                <div className="rounded-lg border border-border bg-card overflow-y-auto max-h-64">
                  {images.map((img, i) => (
                    <div
                      key={`${img.filePath}-${i}`}
                      className="flex items-center gap-3 px-3 py-2 border-b border-border last:border-b-0"
                    >
                      <img
                        src={img.thumbnailUrl}
                        alt={img.fileName}
                        className="w-10 h-12 object-cover rounded border border-border flex-none"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">
                          {img.fileName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {img.naturalWidth} x {img.naturalHeight}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 flex-none">
                        <button
                          type="button"
                          onClick={() => handleMoveUp(i)}
                          disabled={i === 0}
                          className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          aria-label={t('jpgToPdfFlow.moveUpNamed', { name: img.fileName })}
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveDown(i)}
                          disabled={i === images.length - 1}
                          className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          aria-label={t('jpgToPdfFlow.moveDownNamed', { name: img.fileName })}
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemove(i)}
                          className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                          aria-label={t('common.removeNamed', { name: img.fileName })}
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Loading indicator */}
              {isLoading && (
                <div className="flex items-center justify-center gap-2 py-4">
                  <OtterSpinner className="size-4" />
                  <span className="text-sm text-muted-foreground">{t('jpgToPdf.loadingImages')}</span>
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
                  <FilePlus className="w-4 h-4 me-2" />
                  {images.length === 0 ? t('jpgToPdfFlow.selectImages') : t('mergePickStep.addMore')}
                </Button>

                <Button
                  onClick={handleContinue}
                  disabled={images.length < 1 || isLoading}
                  className="flex-1"
                >
                  {t('jpgToPdf.continue')}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Step 1: Configure */}
        {step === 1 && (
          <div className="flex flex-1 flex-col items-center overflow-y-auto p-6">
            <div className="w-full max-w-md space-y-4 my-auto">
              <div className="text-center space-y-1">
                <h2 className="text-lg font-semibold text-foreground">{t('jpgToPdf.configurePdf')}</h2>
                <p className="text-sm text-muted-foreground">
                  {t('jpgToPdfFlow.imagesSelected', { images: plural('count.image', images.length) })}
                </p>
              </div>

              {/* Page size */}
              <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                <p className="text-xs text-muted-foreground">{t('configure.pageSize')}</p>
                <div className="grid grid-cols-3 gap-1">
                  {(['a4', 'letter', 'auto'] as PageSizeId[]).map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setPageSize(id)}
                      disabled={isProcessing}
                      className={cn(
                        'rounded-md border px-3 py-1.5 text-xs font-medium transition-colors',
                        'disabled:cursor-not-allowed disabled:opacity-50',
                        pageSize === id
                          ? 'border-primary bg-primary/5 text-foreground'
                          : 'border-border text-muted-foreground hover:border-primary/50',
                      )}
                    >
                      {pageSizeLabel(id)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Orientation (hidden when auto-fit page size) */}
              {pageSize !== 'auto' && (
                <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                  <p className="text-xs text-muted-foreground">{t('jpgToPdf.orientation')}</p>
                  <div className="grid grid-cols-3 gap-1">
                    {(['portrait', 'landscape', 'auto'] as OrientationId[]).map((id) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setOrientation(id)}
                        disabled={isProcessing}
                        className={cn(
                          'rounded-md border px-3 py-1.5 text-xs font-medium transition-colors',
                          'disabled:cursor-not-allowed disabled:opacity-50',
                          orientation === id
                            ? 'border-primary bg-primary/5 text-foreground'
                            : 'border-border text-muted-foreground hover:border-primary/50',
                        )}
                      >
                        {orientationLabel(id)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Margin */}
              <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                <p className="text-xs text-muted-foreground">{t('jpgToPdf.margin')}</p>
                <div className="grid grid-cols-3 gap-1">
                  {(['none', 'small', 'medium'] as MarginId[]).map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setMargin(id)}
                      disabled={isProcessing}
                      className={cn(
                        'rounded-md border px-3 py-1.5 text-xs font-medium transition-colors',
                        'disabled:cursor-not-allowed disabled:opacity-50',
                        margin === id
                          ? 'border-primary bg-primary/5 text-foreground'
                          : 'border-border text-muted-foreground hover:border-primary/50',
                      )}
                    >
                      {marginLabel(id)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Error */}
              {processError && (
                <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3">
                  <p className="text-xs text-destructive">{processError}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => goToStep(0)}
                  disabled={isProcessing}
                  className="flex-none"
                >
                  {t('common.back')}
                </Button>
                <Button
                  size="sm"
                  data-testid="apply-btn"
                  onClick={handleCreatePdf}
                  disabled={isProcessing}
                  className={PRIMARY_ACTION}
                >
                  {isProcessing ? (
                    <>
                      <OtterSpinner className="size-4" />
                      {t('jpgToPdf.creatingPdf')}
                    </>
                  ) : (
                    t('jpgToPdfFlow.createPdf')
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Save */}
        {step === 2 && resultBytes && (
          <SaveStep
            originPath={images[0]?.filePath ?? null}
            processedBytes={resultBytes}
            sourceFileName="images.pdf"
            defaultSaveName="images.pdf"
            saveFilters={[{ name: t('filter.pdfDocument'), extensions: ['pdf'] }]}
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
