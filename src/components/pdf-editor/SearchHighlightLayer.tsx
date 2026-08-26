// SearchHighlightLayer: draws the toolbar search's matches over a rendered page.
//
// Read-only and pointer-transparent -- it marks where text is, it does not let
// anyone act on it. That is the whole difference from RedactionLayer, which
// draws boxes the user is about to destroy content with.
import { useEditorContext } from '@/context/EditorContext';

interface SearchHighlightLayerProps {
  pageIndex: number;
}

export function SearchHighlightLayer({ pageIndex }: SearchHighlightLayerProps) {
  const { state } = useEditorContext();
  // Absent as well as empty: a view state built before this field existed -- any
  // test harness or persisted state -- must mean "nothing found", not a crash.
  const matches = state.searchMatches ?? [];
  if (matches.length === 0) return null;

  const current = matches[state.searchCurrent];

  return (
    <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
      {matches
        .map((match, index) => ({ match, index }))
        .filter(({ match }) => match.pageIndex === pageIndex)
        .map(({ match, index }) => (
          <div
            key={match.id}
            // Percentages, not pixels: pdfTextSearch reports boxes as a share of
            // the page, so a highlight stays on its word at any zoom without
            // this layer knowing what the zoom is.
            style={{
              position: 'absolute',
              left: `${match.x}%`,
              top: `${match.y}%`,
              width: `${match.width}%`,
              height: `${match.height}%`,
            }}
            className={
              current !== undefined && index === state.searchCurrent
                // The one being stood on has to be findable at a glance on a
                // page where twenty others are also lit up.
                ? 'rounded-[1px] bg-orange-400/60 ring-1 ring-orange-600'
                : 'rounded-[1px] bg-yellow-300/40'
            }
          />
        ))}
    </div>
  );
}
