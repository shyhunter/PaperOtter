// MergeOrderStep: Drag-and-drop reorder with thumbnails and preview.
// Uses native HTML5 DnD for simple list reorder + arrow button fallback.
import { useState, useCallback, useRef } from 'react';
import { ArrowUp, ArrowDown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { renderPdfThumbnail } from '@/lib/pdfThumbnail';
import type { MergeInput } from '@/lib/pdfMerge';

interface FileWithThumb extends MergeInput {
  thumbnailUrl: string;
}

interface MergeOrderStepProps {
  files: MergeInput[];
  onMerged: (mergedBytes: Uint8Array) => void;
  onBack: () => void;
}

export function MergeOrderStep({ files: initialFiles, onMerged, onBack }: MergeOrderStepProps) {
  const [files, setFiles] = useState<FileWithThumb[]>(() =>
    initialFiles.map((f) => ({ ...f, thumbnailUrl: '' })),
  );
  const [isMerging, setIsMerging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dragIndexRef = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Load thumbnails on mount (lazy — doesn't block render)
  useState(() => {
    void (async () => {
      const updated = [...initialFiles.map((f) => ({ ...f, thumbnailUrl: '' }))];
      for (let i = 0; i < updated.length; i++) {
        try {
          updated[i].thumbnailUrl = await renderPdfThumbnail(updated[i].bytes, 0.3);
          setFiles([...updated]);
        } catch {
          // thumbnail failed — leave empty
        }
      }
    })();
  });

  const totalPages = files.reduce((sum, f) => sum + f.pageCount, 0);

  // Arrow reorder
  const moveItem = useCallback((from: number, to: number) => {
    setFiles((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  }, []);

  // HTML5 drag handlers
  const handleDragStart = useCallback((index: number) => {
    dragIndexRef.current = index;
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  }, []);

  const handleDrop = useCallback((index: number) => {
    const from = dragIndexRef.current;
    if (from !== null && from !== index) {
      moveItem(from, index);
    }
    dragIndexRef.current = null;
    setDragOverIndex(null);
  }, [moveItem]);

  const handleDragEnd = useCallback(() => {
    dragIndexRef.current = null;
    setDragOverIndex(null);
  }, []);

  // Merge and advance
  const handleMerge = useCallback(async () => {
    setIsMerging(true);
    setError(null);

    try {
      // Lazy import to keep merge engine out of the initial bundle
      const { mergePdfs } = await import('@/lib/pdfMerge');
      const result = await mergePdfs(files);
      onMerged(result.bytes);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Merge failed.';
      setError(message);
      setIsMerging(false);
    }
  }, [files, onMerged]);

  return (
    <div className="flex flex-1 flex-col p-6">
      <div className="w-full max-w-lg mx-auto space-y-4 flex-1">
        <div className="text-center space-y-1">
          <h2 className="text-lg font-semibold text-foreground">Order & Merge</h2>
          <p className="text-sm text-muted-foreground">
            Drag to reorder. Total: {totalPages} page{totalPages !== 1 ? 's' : ''} from {files.length} files.
          </p>
        </div>

        {/* File list with reorder */}
        <div className="rounded-lg border border-border bg-card overflow-y-auto max-h-72">
          {files.map((file, i) => (
            <div
              key={`${file.filePath}-${i}`}
              draggable
              onDragStart={() => handleDragStart(i)}
              onDragOver={(e) => handleDragOver(e, i)}
              onDrop={() => handleDrop(i)}
              onDragEnd={handleDragEnd}
              className={`flex items-center gap-3 px-3 py-2 border-b border-border last:border-b-0 cursor-grab active:cursor-grabbing transition-colors ${
                dragOverIndex === i ? 'bg-accent/50' : ''
              }`}
            >
              <span className="text-xs font-mono text-muted-foreground w-5 text-center flex-none">
                {i + 1}
              </span>

              {file.thumbnailUrl ? (
                <img
                  src={file.thumbnailUrl}
                  alt={`Page 1 of ${file.fileName}`}
                  className="w-10 h-12 object-cover rounded border border-border flex-none"
                />
              ) : (
                <div className="w-10 h-12 rounded border border-border bg-muted flex-none" />
              )}

              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate">{file.fileName}</p>
                <p className="text-xs text-muted-foreground">{file.pageCount} page{file.pageCount !== 1 ? 's' : ''}</p>
              </div>

              {/* Arrow buttons (accessible fallback) */}
              <div className="flex flex-col gap-0.5 flex-none">
                <button
                  type="button"
                  disabled={i === 0}
                  onClick={() => moveItem(i, i - 1)}
                  className="p-0.5 rounded text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label="Move up"
                >
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  disabled={i === files.length - 1}
                  onClick={() => moveItem(i, i + 1)}
                  className="p-0.5 rounded text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label="Move down"
                >
                  <ArrowDown className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3">
            <p className="text-xs text-destructive">{error}</p>
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <div className="border-t bg-background px-4 py-3 flex items-center gap-3 mt-4">
        <Button variant="outline" size="sm" onClick={onBack} className="flex-none">
          Back
        </Button>
        <div className="flex-1" />
        <Button size="sm" onClick={handleMerge} disabled={isMerging}>
          {isMerging ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Merging…
            </>
          ) : (
            'Merge & Save'
          )}
        </Button>
      </div>
    </div>
  );
}
