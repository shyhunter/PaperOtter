import { useState, useCallback, useRef, useEffect } from 'react';
import { PagePreview, type PageDimensions } from '@/components/shared/PagePreview';
import { addSignature } from '@/lib/pdfSign';
import { PDFDocument } from 'pdf-lib';
import { Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SignaturePlaceStepProps {
  pdfBytes: Uint8Array;
  signatureDataUrl: string;
  onComplete: (resultBytes: Uint8Array) => void;
  onBack: () => void;
}

type PageRangeMode = 'current' | 'all' | 'custom';

/** Parse "1-3, 5, 7-10" into zero-based indices, clamped to [0, maxPage) */
function parsePageRange(input: string, maxPage: number): number[] {
  const indices = new Set<number>();
  const parts = input.split(',').map((s) => s.trim()).filter(Boolean);
  for (const part of parts) {
    const rangeMatch = part.match(/^(\d+)\s*-\s*(\d+)$/);
    if (rangeMatch) {
      const start = Math.max(1, parseInt(rangeMatch[1], 10));
      const end = Math.min(maxPage, parseInt(rangeMatch[2], 10));
      for (let i = start; i <= end; i++) indices.add(i - 1);
    } else {
      const num = parseInt(part, 10);
      if (!isNaN(num) && num >= 1 && num <= maxPage) {
        indices.add(num - 1);
      }
    }
  }
  return Array.from(indices).sort((a, b) => a - b);
}

/** Convert a data URL to Uint8Array (base64 decode) */
function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1];
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return bytes;
}

export function SignaturePlaceStep({
  pdfBytes,
  signatureDataUrl,
  onComplete,
  onBack,
}: SignaturePlaceStepProps) {
  const [pageIndex, setPageIndex] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [pageDims, setPageDims] = useState<PageDimensions | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Signature position/size in screen (preview) coordinates
  const [sigPos, setSigPos] = useState({ x: 0, y: 0 });
  const [sigSize, setSigSize] = useState({ width: 150, height: 75 });
  const [sigAspect, setSigAspect] = useState(2); // width / height

  // Page range
  const [rangeMode, setRangeMode] = useState<PageRangeMode>('current');
  const [customRange, setCustomRange] = useState('');

  // Drag state
  const isDragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  // Resize state
  const isResizing = useRef(false);
  const resizeCorner = useRef<string>('');
  const resizeStart = useRef({ x: 0, y: 0, width: 0, height: 0, posX: 0, posY: 0 });

  // Container ref for coordinate clamping
  const overlayRef = useRef<HTMLDivElement>(null);

  // Load total page count
  useEffect(() => {
    let cancelled = false;
    PDFDocument.load(pdfBytes.slice(), { ignoreEncryption: true }).then((doc) => {
      if (!cancelled) setTotalPages(doc.getPageCount());
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [pdfBytes]);

  // Compute signature aspect ratio from the data URL
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      const aspect = img.width / img.height;
      setSigAspect(aspect);
      setSigSize({ width: 150, height: 150 / aspect });
    };
    img.src = signatureDataUrl;
  }, [signatureDataUrl]);

  // Center signature when page dimensions change
  useEffect(() => {
    if (pageDims) {
      const w = 150;
      const h = w / sigAspect;
      setSigPos({
        x: (pageDims.width - w) / 2,
        y: (pageDims.height - h) / 2,
      });
      setSigSize({ width: w, height: h });
    }
  }, [pageDims, sigAspect]);

  const handleDimensionsReady = useCallback((dims: PageDimensions) => {
    setPageDims(dims);
  }, []);

  // --- Drag handlers ---
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Don't start drag if clicking a resize handle
    if ((e.target as HTMLElement).dataset.resize) return;
    e.preventDefault();
    isDragging.current = true;
    dragOffset.current = {
      x: e.clientX - sigPos.x,
      y: e.clientY - sigPos.y,
    };
  }, [sigPos]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging.current && pageDims) {
        const maxX = pageDims.width - sigSize.width;
        const maxY = pageDims.height - sigSize.height;
        setSigPos({
          x: Math.max(0, Math.min(maxX, e.clientX - dragOffset.current.x)),
          y: Math.max(0, Math.min(maxY, e.clientY - dragOffset.current.y)),
        });
      }
      if (isResizing.current && pageDims) {
        const dx = e.clientX - resizeStart.current.x;
        const corner = resizeCorner.current;

        let newWidth = resizeStart.current.width;
        let newPosX = resizeStart.current.posX;
        let newPosY = resizeStart.current.posY;

        if (corner === 'se') {
          newWidth = Math.max(40, resizeStart.current.width + dx);
        } else if (corner === 'sw') {
          const widthDelta = -dx;
          newWidth = Math.max(40, resizeStart.current.width + widthDelta);
          newPosX = resizeStart.current.posX - (newWidth - resizeStart.current.width);
        } else if (corner === 'ne') {
          newWidth = Math.max(40, resizeStart.current.width + dx);
        } else if (corner === 'nw') {
          const widthDelta = -dx;
          newWidth = Math.max(40, resizeStart.current.width + widthDelta);
          newPosX = resizeStart.current.posX - (newWidth - resizeStart.current.width);
        }

        const newHeight = newWidth / sigAspect;

        // For top corners, adjust Y position
        if (corner === 'ne' || corner === 'nw') {
          newPosY = resizeStart.current.posY + resizeStart.current.height - newHeight;
        }

        // Clamp within page bounds
        newPosX = Math.max(0, Math.min(pageDims.width - newWidth, newPosX));
        newPosY = Math.max(0, Math.min(pageDims.height - newHeight, newPosY));

        setSigPos({ x: newPosX, y: newPosY });
        setSigSize({ width: newWidth, height: newHeight });
      }
    };

    const handleMouseUp = () => {
      isDragging.current = false;
      isResizing.current = false;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [pageDims, sigSize, sigAspect]);

  // --- Resize handle ---
  const handleResizeMouseDown = useCallback((e: React.MouseEvent, corner: string) => {
    e.preventDefault();
    e.stopPropagation();
    isResizing.current = true;
    resizeCorner.current = corner;
    resizeStart.current = {
      x: e.clientX,
      y: e.clientY,
      width: sigSize.width,
      height: sigSize.height,
      posX: sigPos.x,
      posY: sigPos.y,
    };
  }, [sigSize, sigPos]);

  // --- Apply signature ---
  const handleApply = useCallback(async () => {
    if (!pageDims) return;
    setIsProcessing(true);

    try {
      // Determine target page indices
      let pageIndices: number[];
      if (rangeMode === 'current') {
        pageIndices = [pageIndex];
      } else if (rangeMode === 'all') {
        pageIndices = Array.from({ length: totalPages }, (_, i) => i);
      } else {
        pageIndices = parsePageRange(customRange, totalPages);
        if (pageIndices.length === 0) {
          pageIndices = [pageIndex]; // fallback to current page
        }
      }

      // Convert screen coordinates to PDF coordinates
      // PDF uses bottom-left origin, screen uses top-left
      const scaleX = pageDims.pdfWidth / pageDims.width;
      const scaleY = pageDims.pdfHeight / pageDims.height;
      const pdfSigWidth = sigSize.width * scaleX;
      const pdfSigHeight = sigSize.height * scaleY;
      const pdfX = sigPos.x * scaleX;
      // CRITICAL: PDF y=0 is bottom; screen y=0 is top
      const pdfY = pageDims.pdfHeight - (sigPos.y + sigSize.height) * scaleY;

      const imageBytes = dataUrlToBytes(signatureDataUrl);

      const result = await addSignature(pdfBytes, {
        imageBytes,
        x: pdfX,
        y: pdfY,
        width: pdfSigWidth,
        height: pdfSigHeight,
        pageIndices,
      });

      onComplete(result);
    } catch (err) {
      console.error('Failed to apply signature:', err);
    } finally {
      setIsProcessing(false);
    }
  }, [pageDims, sigPos, sigSize, signatureDataUrl, pdfBytes, pageIndex, totalPages, rangeMode, customRange, onComplete]);

  const corners = ['nw', 'ne', 'sw', 'se'];
  const cornerPositions: Record<string, React.CSSProperties> = {
    nw: { top: -4, left: -4, cursor: 'nw-resize' },
    ne: { top: -4, right: -4, cursor: 'ne-resize' },
    sw: { bottom: -4, left: -4, cursor: 'sw-resize' },
    se: { bottom: -4, right: -4, cursor: 'se-resize' },
  };

  return (
    <div className="flex flex-1 gap-4 overflow-hidden p-4">
      {/* Left: Page preview with signature overlay */}
      <div className="flex flex-1 flex-col items-center overflow-auto">
        <PagePreview
          pdfBytes={pdfBytes}
          pageIndex={pageIndex}
          scale={1.2}
          onDimensionsReady={handleDimensionsReady}
        >
          {/* Signature overlay */}
          <div
            ref={overlayRef}
            className="absolute inset-0"
            style={{ cursor: isDragging.current ? 'grabbing' : 'default' }}
          >
            <div
              onMouseDown={handleMouseDown}
              className="absolute border-2 border-primary/50 bg-primary/5"
              style={{
                left: sigPos.x,
                top: sigPos.y,
                width: sigSize.width,
                height: sigSize.height,
                cursor: 'grab',
                userSelect: 'none',
              }}
            >
              <img
                src={signatureDataUrl}
                alt="Signature"
                className="pointer-events-none h-full w-full object-contain"
                draggable={false}
              />

              {/* Resize handles */}
              {corners.map((corner) => (
                <div
                  key={corner}
                  data-resize="true"
                  onMouseDown={(e) => handleResizeMouseDown(e, corner)}
                  className="absolute h-3 w-3 rounded-sm border border-primary bg-background"
                  style={cornerPositions[corner]}
                />
              ))}
            </div>
          </div>
        </PagePreview>
      </div>

      {/* Right: Controls panel */}
      <div className="flex w-64 flex-col gap-4 rounded-lg border border-border bg-card p-4">
        {/* Page navigation */}
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Page Navigation
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setPageIndex((i) => Math.max(0, i - 1))}
              disabled={pageIndex === 0}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <select
              value={pageIndex}
              onChange={(e) => setPageIndex(Number(e.target.value))}
              aria-label="Page selector"
              className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-center text-sm text-foreground"
            >
              {Array.from({ length: totalPages }, (_, i) => (
                <option key={i} value={i}>
                  Page {i + 1} of {totalPages}
                </option>
              ))}
            </select>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setPageIndex((i) => Math.min(totalPages - 1, i + 1))}
              disabled={pageIndex === totalPages - 1}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Page range selector */}
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Apply To
          </p>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
              <input
                type="radio"
                name="page-range"
                checked={rangeMode === 'current'}
                onChange={() => setRangeMode('current')}
                className="accent-primary"
              />
              Current page only
            </label>
            <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
              <input
                type="radio"
                name="page-range"
                checked={rangeMode === 'all'}
                onChange={() => setRangeMode('all')}
                className="accent-primary"
              />
              All pages
            </label>
            <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
              <input
                type="radio"
                name="page-range"
                checked={rangeMode === 'custom'}
                onChange={() => setRangeMode('custom')}
                className="accent-primary"
              />
              Custom range
            </label>
            {rangeMode === 'custom' && (
              <input
                type="text"
                value={customRange}
                onChange={(e) => setCustomRange(e.target.value)}
                placeholder="e.g. 1-3, 5, 7-10"
                className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            )}
          </div>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Actions */}
        <div className="space-y-2">
          <Button
            onClick={handleApply}
            disabled={isProcessing || !pageDims}
            className="w-full"
          >
            {isProcessing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Applying...
              </>
            ) : (
              'Apply Signature'
            )}
          </Button>
          <Button variant="outline" size="sm" onClick={onBack} className="w-full">
            Back
          </Button>
        </div>
      </div>
    </div>
  );
}
