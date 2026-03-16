// EditorContext: state management for the full-page PDF editor (Phase 16).
// Provides zoom, page navigation, dirty tracking, and keyboard shortcuts.
//
// Uses useReducer for complex state transitions.
import {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import type { ReactNode } from 'react';
import type { EditorViewState, ZoomPreset, PageEditState } from '@/types/editor';

// ── Actions ────────────────────────────────────────────────────────────

type EditorAction =
  | { type: 'SET_ZOOM'; zoom: number }
  | { type: 'SET_ZOOM_PRESET'; preset: ZoomPreset; fitWidthZoom: number }
  | { type: 'SET_CURRENT_PAGE'; page: number }
  | { type: 'MARK_DIRTY' }
  | { type: 'UPDATE_PDF_BYTES'; bytes: Uint8Array }
  | { type: 'SET_FILE_PATH'; path: string }
  | { type: 'SET_FILE_NAME'; name: string }
  | { type: 'INIT'; state: EditorViewState };

// ── Reducer ────────────────────────────────────────────────────────────

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 3.0;
const ZOOM_STEP = 0.25;

function clampZoom(z: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
}

function editorReducer(state: EditorViewState, action: EditorAction): EditorViewState {
  switch (action.type) {
    case 'SET_ZOOM':
      return { ...state, zoom: clampZoom(action.zoom), zoomPreset: null };
    case 'SET_ZOOM_PRESET': {
      if (action.preset === 'fit-width') {
        return { ...state, zoom: action.fitWidthZoom, zoomPreset: 'fit-width' };
      }
      return { ...state, zoom: action.preset, zoomPreset: action.preset };
    }
    case 'SET_CURRENT_PAGE':
      return { ...state, currentPage: action.page };
    case 'MARK_DIRTY':
      return { ...state, isDirty: true };
    case 'UPDATE_PDF_BYTES':
      return { ...state, pdfBytes: action.bytes };
    case 'SET_FILE_PATH':
      return { ...state, filePath: action.path };
    case 'SET_FILE_NAME':
      return { ...state, fileName: action.name };
    case 'INIT':
      return action.state;
    default:
      return state;
  }
}

// ── Context value ──────────────────────────────────────────────────────

interface EditorContextValue {
  state: EditorViewState;
  setZoom: (level: number) => void;
  setZoomPreset: (preset: ZoomPreset) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  setCurrentPage: (idx: number) => void;
  markDirty: () => void;
  updatePdfBytes: (bytes: Uint8Array) => void;
  setFilePath: (path: string) => void;
  setFileName: (name: string) => void;
  /** Initialize full editor state (used by EditorView on PDF load) */
  initState: (state: EditorViewState) => void;
  /** Current fit-width zoom value (recalculated on resize) */
  fitWidthZoom: number;
  setFitWidthZoom: (z: number) => void;
}

const EditorCtx = createContext<EditorContextValue | null>(null);

// ── Provider ───────────────────────────────────────────────────────────

function createEmptyState(): EditorViewState {
  return {
    pdfBytes: new Uint8Array(0),
    filePath: null,
    fileName: '',
    pageCount: 0,
    zoom: 1.0,
    zoomPreset: 'fit-width',
    currentPage: 0,
    isDirty: false,
    pages: [],
  };
}

export function EditorProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(editorReducer, createEmptyState());
  const fitWidthZoomRef = useRef(1.0);

  const setFitWidthZoom = useCallback((z: number) => {
    fitWidthZoomRef.current = z;
  }, []);

  const setZoom = useCallback((level: number) => {
    dispatch({ type: 'SET_ZOOM', zoom: level });
  }, []);

  const setZoomPreset = useCallback((preset: ZoomPreset) => {
    dispatch({ type: 'SET_ZOOM_PRESET', preset, fitWidthZoom: fitWidthZoomRef.current });
  }, []);

  const zoomIn = useCallback(() => {
    dispatch({ type: 'SET_ZOOM', zoom: clampZoom(state.zoom + ZOOM_STEP) });
  }, [state.zoom]);

  const zoomOut = useCallback(() => {
    dispatch({ type: 'SET_ZOOM', zoom: clampZoom(state.zoom - ZOOM_STEP) });
  }, [state.zoom]);

  const setCurrentPage = useCallback((idx: number) => {
    dispatch({ type: 'SET_CURRENT_PAGE', page: idx });
  }, []);

  const markDirty = useCallback(() => {
    dispatch({ type: 'MARK_DIRTY' });
  }, []);

  const updatePdfBytes = useCallback((bytes: Uint8Array) => {
    dispatch({ type: 'UPDATE_PDF_BYTES', bytes });
  }, []);

  const setFilePath = useCallback((path: string) => {
    dispatch({ type: 'SET_FILE_PATH', path });
  }, []);

  const setFileName = useCallback((name: string) => {
    dispatch({ type: 'SET_FILE_NAME', name });
  }, []);

  const initState = useCallback((s: EditorViewState) => {
    dispatch({ type: 'INIT', state: s });
  }, []);

  // Keyboard shortcuts: Cmd+= zoom in, Cmd+- zoom out, Cmd+0 fit-width
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!e.metaKey && !e.ctrlKey) return;

      if (e.key === '=' || e.key === '+') {
        e.preventDefault();
        dispatch({ type: 'SET_ZOOM', zoom: clampZoom(state.zoom + ZOOM_STEP) });
      } else if (e.key === '-') {
        e.preventDefault();
        dispatch({ type: 'SET_ZOOM', zoom: clampZoom(state.zoom - ZOOM_STEP) });
      } else if (e.key === '0') {
        e.preventDefault();
        dispatch({
          type: 'SET_ZOOM_PRESET',
          preset: 'fit-width',
          fitWidthZoom: fitWidthZoomRef.current,
        });
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state.zoom]);

  const value = useMemo<EditorContextValue>(
    () => ({
      state,
      setZoom,
      setZoomPreset,
      zoomIn,
      zoomOut,
      setCurrentPage,
      markDirty,
      updatePdfBytes,
      setFilePath,
      setFileName,
      initState,
      fitWidthZoom: fitWidthZoomRef.current,
      setFitWidthZoom,
    }),
    [
      state,
      setZoom,
      setZoomPreset,
      zoomIn,
      zoomOut,
      setCurrentPage,
      markDirty,
      updatePdfBytes,
      setFilePath,
      setFileName,
      initState,
      setFitWidthZoom,
    ],
  );

  return <EditorCtx.Provider value={value}>{children}</EditorCtx.Provider>;
}

export function useEditorContext(): EditorContextValue {
  const ctx = useContext(EditorCtx);
  if (!ctx) {
    throw new Error('useEditorContext must be used within an <EditorProvider>');
  }
  return ctx;
}

// Re-export for convenience — initialise state from loaded PDF
export function createEditorViewState(
  pdfBytes: Uint8Array,
  pageCount: number,
  fileName: string,
  filePath: string | null,
  fitWidthZoom: number,
): EditorViewState {
  const pages: PageEditState[] = Array.from({ length: pageCount }, (_, i) => ({
    pageIndex: i,
    textBlocks: [],
    imageBlocks: [],
    deletedTextIds: [],
    deletedImageIds: [],
    deletedTextBlocks: [],
    deletedImageBlocks: [],
  }));

  return {
    pdfBytes,
    filePath,
    fileName,
    pageCount,
    zoom: fitWidthZoom,
    zoomPreset: 'fit-width',
    currentPage: 0,
    isDirty: false,
    pages,
  };
}
