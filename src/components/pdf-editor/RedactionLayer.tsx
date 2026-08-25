// RedactionLayer: the same draw-a-box redaction the standalone Redact tool has,
// on the editor canvas.
//
// It reuses RedactOverlay rather than reimplementing it, so the two cannot drift
// -- the editor used to place a text block full of block characters over the
// content instead, which covered the pixels and left the text in the file.
import { useCallback } from 'react';
import { useEditorContext } from '@/context/EditorContext';
import { RedactOverlay, type RedactionRect } from '@/components/redact-pdf/RedactOverlay';

interface RedactionLayerProps {
  pageIndex: number;
  pageWidth: number;   // PDF points
  pageHeight: number;  // PDF points
  zoom: number;
}

let nextId = 1;

export function RedactionLayer({ pageIndex, pageWidth, pageHeight, zoom }: RedactionLayerProps) {
  const { state, setRedactionDraft } = useEditorContext();
  // Absent as well as null: a state object built before this field existed --
  // any test harness or persisted view state -- must mean "not redacting", not
  // a crash on the canvas.
  const draft = state.redactionDraft ?? null;

  const handleAdd = useCallback(
    (rect: Omit<RedactionRect, 'id' | 'source'>) => {
      setRedactionDraft([
        ...(draft ?? []),
        { ...rect, id: `redact-${nextId++}`, source: 'drawn' },
      ]);
    },
    [draft, setRedactionDraft],
  );

  const handleRemove = useCallback(
    (id: string) => setRedactionDraft((draft ?? []).filter((r) => r.id !== id)),
    [draft, setRedactionDraft],
  );

  // Null means the redact tool is not open, so the canvas must not capture drags.
  if (draft === null) return null;

  return (
    <div className="absolute inset-0">
      <RedactOverlay
        redactions={draft.filter((r) => r.pageIndex === pageIndex)}
        onAddRedaction={(rect) => handleAdd({ ...rect, pageIndex })}
        onRemoveRedaction={handleRemove}
        color={state.redactionColor}
        width={pageWidth * zoom}
        height={pageHeight * zoom}
      />
    </div>
  );
}
