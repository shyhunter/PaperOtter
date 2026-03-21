// ToolSidebarPreview: before/after thumbnail comparison for tool sidebar panels.
// Renders the current page from the original PDF and the preview (processed) PDF side-by-side.
// Includes "Compare" button to open full-page CompareOverlay.
// CRITICAL: Always pass bytes.slice() to pdf.js — see project memory re: detached ArrayBuffer.
import { useEffect, useState, useRef } from 'react';
import { renderPdfPageThumbnail } from '@/lib/pdfThumbnail';
import { useEditorContext } from '@/context/EditorContext';
import { Loader2, Expand } from 'lucide-react';
import { CompareOverlay } from './CompareOverlay';

interface ToolSidebarPreviewProps {
  originalBytes: Uint8Array;
  previewBytes: Uint8Array | null;
  isProcessing?: boolean;
  /** Override which page to render from previewBytes. Defaults to the editor's
   *  current page. Pass 0 when previewBytes is a single-page preview PDF so
   *  the thumbnail always shows the correct page. */
  previewPageIndex?: number;
}

export function ToolSidebarPreview({
  originalBytes,
  previewBytes,
  isProcessing = false,
  previewPageIndex,
}: ToolSidebarPreviewProps) {
  const { state } = useEditorContext();
  const [beforeUrl, setBeforeUrl] = useState<string | null>(null);
  const [afterUrl, setAfterUrl] = useState<string | null>(null);
  const [showOverlay, setShowOverlay] = useState(false);
  const renderIdRef = useRef(0);

  // Render "Before" thumbnail
  useEffect(() => {
    if (originalBytes.byteLength === 0) return;

    let cancelled = false;
    const id = ++renderIdRef.current;

    renderPdfPageThumbnail(originalBytes, state.currentPage, 0.5)
      .then((url) => {
        if (!cancelled && renderIdRef.current === id) setBeforeUrl(url);
      })
      .catch(() => {
        if (!cancelled) setBeforeUrl(null);
      });

    return () => {
      cancelled = true;
    };
  }, [originalBytes, state.currentPage]);

  // Render "After" thumbnail
  useEffect(() => {
    if (!previewBytes || previewBytes.byteLength === 0) {
      setAfterUrl(null);
      return;
    }

    let cancelled = false;

    const pageIdx = previewPageIndex ?? state.currentPage;
    renderPdfPageThumbnail(previewBytes, pageIdx, 0.5)
      .then((url) => {
        if (!cancelled) setAfterUrl(url);
      })
      .catch(() => {
        if (!cancelled) setAfterUrl(null);
      });

    return () => {
      cancelled = true;
    };
  }, [previewBytes, previewPageIndex, state.currentPage]);

  return (
    <>
      <div className="space-y-1.5">
        <div className="flex gap-2 w-full">
          {/* Before */}
          <div className="flex-1 min-w-0">
            <div className="text-[10px] text-muted-foreground mb-1 text-center font-medium">Before</div>
            <div className="border rounded bg-muted/30 aspect-[3/4] flex items-center justify-center overflow-hidden">
              {beforeUrl ? (
                <img src={beforeUrl} alt="Before" className="w-full h-full object-contain" />
              ) : (
                <div className="text-[10px] text-muted-foreground">...</div>
              )}
            </div>
          </div>

          {/* After */}
          <div className="flex-1 min-w-0">
            <div className="text-[10px] text-muted-foreground mb-1 text-center font-medium">After</div>
            <div className="border rounded bg-muted/30 aspect-[3/4] flex items-center justify-center overflow-hidden relative">
              {isProcessing ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : afterUrl ? (
                <img src={afterUrl} alt="After" className="w-full h-full object-contain" />
              ) : beforeUrl ? (
                <img src={beforeUrl} alt="Pending" className="w-full h-full object-contain opacity-30" />
              ) : (
                <div className="text-[10px] text-muted-foreground">...</div>
              )}
            </div>
          </div>
        </div>

        {/* Compare button — opens full-page overlay.
            Hidden when previewPageIndex is provided because previewBytes is then a
            single-page document that cannot meaningfully compare against the full PDF. */}
        {previewBytes && !isProcessing && previewPageIndex === undefined && (
          <button
            type="button"
            onClick={() => setShowOverlay(true)}
            className="w-full flex items-center justify-center gap-1.5 py-1 text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded border border-dashed transition-colors"
          >
            <Expand className="h-3 w-3" />
            Full comparison view
          </button>
        )}
      </div>

      {/* Full-page compare overlay */}
      {showOverlay && previewBytes && (
        <CompareOverlay
          originalBytes={originalBytes}
          previewBytes={previewBytes}
          onClose={() => setShowOverlay(false)}
          initialPage={state.currentPage}
        />
      )}
    </>
  );
}
