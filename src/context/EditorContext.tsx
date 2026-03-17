// EditorContext: state management for the full-page PDF editor (Phase 16).
// Provides zoom, page navigation, dirty tracking, text editing state, and keyboard shortcuts.
//
// Uses useReducer for complex state transitions.
import React, {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { PDFDocument, PageSizes } from 'pdf-lib';
import type { EditorViewState, ZoomPreset, PageEditState, TextBlock, EditorMode } from '@/types/editor';

// ── Actions ────────────────────────────────────────────────────────────

type EditorAction =
  | { type: 'SET_ZOOM'; zoom: number }
  | { type: 'SET_ZOOM_PRESET'; preset: ZoomPreset; fitWidthZoom: number }
  | { type: 'SET_CURRENT_PAGE'; page: number }
  | { type: 'MARK_DIRTY' }
  | { type: 'UPDATE_PDF_BYTES'; bytes: Uint8Array; pageCount?: number; pages?: PageEditState[] }
  | { type: 'SET_FILE_PATH'; path: string }
  | { type: 'SET_FILE_NAME'; name: string }
  | { type: 'INIT'; state: EditorViewState }
  | { type: 'SELECT_BLOCK'; id: string | null }
  | { type: 'START_EDITING'; id: string }
  | { type: 'STOP_EDITING' }
  | { type: 'SET_EDITOR_MODE'; mode: EditorMode }
  | { type: 'SET_PAGE_TEXT_BLOCKS'; pageIdx: number; blocks: TextBlock[] }
  | { type: 'UPDATE_TEXT_BLOCK'; pageIdx: number; block: TextBlock }
  | { type: 'ADD_TEXT_BLOCK'; pageIdx: number; block: TextBlock }
  | { type: 'DELETE_TEXT_BLOCK'; pageIdx: number; blockId: string };

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
    case 'UPDATE_PDF_BYTES': {
      const updates: Partial<EditorViewState> = { pdfBytes: action.bytes, isDirty: true };
      if (action.pageCount !== undefined) updates.pageCount = action.pageCount;
      if (action.pages !== undefined) updates.pages = action.pages;
      return { ...state, ...updates };
    }
    case 'SET_FILE_PATH':
      return { ...state, filePath: action.path };
    case 'SET_FILE_NAME':
      return { ...state, fileName: action.name };
    case 'INIT':
      return action.state;
    case 'SELECT_BLOCK':
      return { ...state, selectedBlockId: action.id, editingBlockId: action.id === null ? null : state.editingBlockId };
    case 'START_EDITING':
      return { ...state, selectedBlockId: action.id, editingBlockId: action.id };
    case 'STOP_EDITING':
      return { ...state, editingBlockId: null };
    case 'SET_EDITOR_MODE':
      return { ...state, editorMode: action.mode, selectedBlockId: null, editingBlockId: null };
    case 'SET_PAGE_TEXT_BLOCKS': {
      const pages = state.pages.map((p, i) =>
        i === action.pageIdx ? { ...p, textBlocks: action.blocks } : p,
      );
      return { ...state, pages };
    }
    case 'UPDATE_TEXT_BLOCK': {
      const pages = state.pages.map((p, i) => {
        if (i !== action.pageIdx) return p;
        const textBlocks = p.textBlocks.map((b) =>
          b.id === action.block.id ? action.block : b,
        );
        return { ...p, textBlocks };
      });
      return { ...state, pages, isDirty: true };
    }
    case 'ADD_TEXT_BLOCK': {
      const pages = state.pages.map((p, i) => {
        if (i !== action.pageIdx) return p;
        return { ...p, textBlocks: [...p.textBlocks, action.block] };
      });
      return { ...state, pages, isDirty: true };
    }
    case 'DELETE_TEXT_BLOCK': {
      const pages = state.pages.map((p, i) => {
        if (i !== action.pageIdx) return p;
        const deleted = p.textBlocks.find((b) => b.id === action.blockId);
        const textBlocks = p.textBlocks.filter((b) => b.id !== action.blockId);
        const deletedTextIds = deleted && !deleted.isNew
          ? [...p.deletedTextIds, action.blockId]
          : p.deletedTextIds;
        const deletedTextBlocks = deleted && !deleted.isNew
          ? [...p.deletedTextBlocks, { id: deleted.id, x: deleted.x, y: deleted.y, width: deleted.width, height: deleted.height }]
          : p.deletedTextBlocks;
        return { ...p, textBlocks, deletedTextIds, deletedTextBlocks };
      });
      return {
        ...state, pages, isDirty: true,
        selectedBlockId: state.selectedBlockId === action.blockId ? null : state.selectedBlockId,
        editingBlockId: state.editingBlockId === action.blockId ? null : state.editingBlockId,
      };
    }
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
  // Page selection
  selectedPages: Set<number>;
  togglePageSelection: (idx: number, multi: boolean) => void;
  selectPageRange: (from: number, to: number) => void;
  clearPageSelection: () => void;

  // Page operations
  reorderPages: (fromIdx: number, toIdx: number) => void;
  addBlankPage: (afterIdx: number) => void;
  addPagesFromPdf: (afterIdx: number, pdfBytes: Uint8Array) => void;
  deletePages: (indices: number[]) => void;
  duplicatePages: (indices: number[]) => void;

  // Scroll-to-page ref (set by EditorCanvas, used by PagePanel)
  scrollToPageRef: React.MutableRefObject<((idx: number) => void) | null>;

  // Text editing actions
  selectBlock: (id: string | null) => void;
  startEditing: (id: string) => void;
  stopEditing: () => void;
  setEditorMode: (mode: EditorMode) => void;
  setPageTextBlocks: (pageIdx: number, blocks: TextBlock[]) => void;
  updateTextBlock: (pageIdx: number, block: TextBlock) => void;
  addTextBlock: (pageIdx: number, block: TextBlock) => void;
  deleteTextBlock: (pageIdx: number, blockId: string) => void;
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
    selectedBlockId: null,
    editingBlockId: null,
    editorMode: 'select',
  };
}

export function EditorProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(editorReducer, createEmptyState());
  const fitWidthZoomRef = useRef(1.0);
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());
  const scrollToPageRef = useRef<((idx: number) => void) | null>(null);

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
    setSelectedPages(new Set());
  }, []);

  const selectBlock = useCallback((id: string | null) => {
    dispatch({ type: 'SELECT_BLOCK', id });
  }, []);

  const startEditing = useCallback((id: string) => {
    dispatch({ type: 'START_EDITING', id });
  }, []);

  const stopEditing = useCallback(() => {
    dispatch({ type: 'STOP_EDITING' });
  }, []);

  const setEditorMode = useCallback((mode: EditorMode) => {
    dispatch({ type: 'SET_EDITOR_MODE', mode });
  }, []);

  const setPageTextBlocks = useCallback((pageIdx: number, blocks: TextBlock[]) => {
    dispatch({ type: 'SET_PAGE_TEXT_BLOCKS', pageIdx, blocks });
  }, []);

  const updateTextBlock = useCallback((pageIdx: number, block: TextBlock) => {
    dispatch({ type: 'UPDATE_TEXT_BLOCK', pageIdx, block });
  }, []);

  const addTextBlock = useCallback((pageIdx: number, block: TextBlock) => {
    dispatch({ type: 'ADD_TEXT_BLOCK', pageIdx, block });
  }, []);

  const deleteTextBlock = useCallback((pageIdx: number, blockId: string) => {
    dispatch({ type: 'DELETE_TEXT_BLOCK', pageIdx, blockId });
  }, []);

  // Page selection callbacks (needed by PagePanel)
  const togglePageSelection = useCallback((idx: number, multi: boolean) => {
    setSelectedPages((prev) => {
      const next = new Set(multi ? prev : []);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  const selectPageRange = useCallback((from: number, to: number) => {
    const min = Math.min(from, to);
    const max = Math.max(from, to);
    const next = new Set<number>();
    for (let i = min; i <= max; i++) next.add(i);
    setSelectedPages(next);
  }, []);

  const clearPageSelection = useCallback(() => {
    setSelectedPages(new Set());
  }, []);

  // Page operations
  const reorderPages = useCallback(async (fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx || state.pdfBytes.byteLength === 0) return;
    try {
      const srcDoc = await PDFDocument.load(state.pdfBytes, { ignoreEncryption: true });
      const newDoc = await PDFDocument.create();
      const indices = Array.from({ length: srcDoc.getPageCount() }, (_, i) => i);
      const [moved] = indices.splice(fromIdx, 1);
      indices.splice(toIdx, 0, moved);
      const copiedPages = await newDoc.copyPages(srcDoc, indices);
      for (const page of copiedPages) newDoc.addPage(page);
      const newBytes = new Uint8Array(await newDoc.save({ useObjectStreams: false }));
      const reindexed = state.pages.map((p, i) => ({ ...p, pageIndex: indices.indexOf(i) }));
      // Sort by new position
      const sortedPages = [...reindexed].sort((a, b) => {
        const aNew = indices.indexOf(a.pageIndex);
        const bNew = indices.indexOf(b.pageIndex);
        return aNew - bNew;
      });
      const finalPages = sortedPages.map((p, i) => ({ ...p, pageIndex: i }));
      dispatch({ type: 'INIT', state: { ...state, pdfBytes: newBytes, pages: finalPages, isDirty: true } });
    } catch (err) {
      console.error('reorderPages failed:', err);
    }
  }, [state]);

  const addBlankPage = useCallback(async (afterIdx: number) => {
    try {
      const doc = await PDFDocument.load(state.pdfBytes, { ignoreEncryption: true });
      const page = doc.insertPage(afterIdx + 1, PageSizes.A4);
      void page;
      const newBytes = new Uint8Array(await doc.save({ useObjectStreams: false }));

      const newPages = [...state.pages];
      newPages.splice(afterIdx + 1, 0, {
        pageIndex: afterIdx + 1,
        textBlocks: [],
        imageBlocks: [],
        deletedTextIds: [],
        deletedImageIds: [],
        deletedTextBlocks: [],
        deletedImageBlocks: [],
      });
      const reindexed = newPages.map((p, i) => ({ ...p, pageIndex: i }));

      dispatch({
        type: 'INIT',
        state: {
          ...state,
          pdfBytes: newBytes,
          pageCount: reindexed.length,
          pages: reindexed,
          isDirty: true,
        },
      });
    } catch { /* ignore */ }
  }, [state]);

  const addPagesFromPdf = useCallback(async (afterIdx: number, sourcePdfBytes: Uint8Array) => {
    try {
      const targetDoc = await PDFDocument.load(state.pdfBytes, { ignoreEncryption: true });
      const sourceDoc = await PDFDocument.load(sourcePdfBytes, { ignoreEncryption: true });
      const indices = Array.from({ length: sourceDoc.getPageCount() }, (_, i) => i);
      const copiedPages = await targetDoc.copyPages(sourceDoc, indices);
      copiedPages.forEach((page, i) => targetDoc.insertPage(afterIdx + 1 + i, page));

      const newBytes = new Uint8Array(await targetDoc.save({ useObjectStreams: false }));
      const addedPages: PageEditState[] = copiedPages.map((_, i) => ({
        pageIndex: afterIdx + 1 + i,
        textBlocks: [],
        imageBlocks: [],
        deletedTextIds: [],
        deletedImageIds: [],
        deletedTextBlocks: [],
        deletedImageBlocks: [],
      }));

      const newPages = [...state.pages];
      newPages.splice(afterIdx + 1, 0, ...addedPages);
      const reindexed = newPages.map((p, i) => ({ ...p, pageIndex: i }));

      dispatch({
        type: 'INIT',
        state: {
          ...state,
          pdfBytes: newBytes,
          pageCount: reindexed.length,
          pages: reindexed,
          isDirty: true,
        },
      });
    } catch { /* ignore */ }
  }, [state]);

  const deletePages = useCallback(async (indices: number[]) => {
    if (indices.length === 0 || indices.length >= state.pageCount) return;
    try {
      const doc = await PDFDocument.load(state.pdfBytes, { ignoreEncryption: true });
      // Remove pages in reverse order to preserve indices
      const sorted = [...indices].sort((a, b) => b - a);
      sorted.forEach((idx) => doc.removePage(idx));

      const newBytes = new Uint8Array(await doc.save({ useObjectStreams: false }));
      const idxSet = new Set(indices);
      const newPages = state.pages.filter((_, i) => !idxSet.has(i));
      const reindexed = newPages.map((p, i) => ({ ...p, pageIndex: i }));

      dispatch({
        type: 'INIT',
        state: {
          ...state,
          pdfBytes: newBytes,
          pageCount: reindexed.length,
          pages: reindexed,
          isDirty: true,
          currentPage: Math.min(state.currentPage, reindexed.length - 1),
        },
      });
      setSelectedPages(new Set());
    } catch { /* ignore */ }
  }, [state]);

  const duplicatePages = useCallback(async (indices: number[]) => {
    if (indices.length === 0) return;
    try {
      const doc = await PDFDocument.load(state.pdfBytes, { ignoreEncryption: true });
      const sorted = [...indices].sort((a, b) => a - b);
      let offset = 0;
      for (const idx of sorted) {
        const [copiedPage] = await doc.copyPages(doc, [idx + offset]);
        doc.insertPage(idx + offset + 1, copiedPage);
        offset++;
      }

      const newBytes = new Uint8Array(await doc.save({ useObjectStreams: false }));
      const newPages = [...state.pages];
      let dupOffset = 0;
      for (const idx of sorted) {
        const insertAt = idx + dupOffset + 1;
        newPages.splice(insertAt, 0, {
          pageIndex: insertAt,
          textBlocks: [],
          imageBlocks: [],
          deletedTextIds: [],
          deletedImageIds: [],
          deletedTextBlocks: [],
          deletedImageBlocks: [],
        });
        dupOffset++;
      }
      const reindexed = newPages.map((p, i) => ({ ...p, pageIndex: i }));

      dispatch({
        type: 'INIT',
        state: {
          ...state,
          pdfBytes: newBytes,
          pageCount: reindexed.length,
          pages: reindexed,
          isDirty: true,
        },
      });
    } catch { /* ignore */ }
  }, [state]);

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
      selectBlock,
      startEditing,
      stopEditing,
      setEditorMode,
      setPageTextBlocks,
      updateTextBlock,
      addTextBlock,
      deleteTextBlock,
      // Page management
      selectedPages,
      togglePageSelection,
      selectPageRange,
      clearPageSelection,
      reorderPages,
      addBlankPage,
      addPagesFromPdf,
      deletePages,
      duplicatePages,
      scrollToPageRef,
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
      selectBlock,
      startEditing,
      stopEditing,
      setEditorMode,
      setPageTextBlocks,
      updateTextBlock,
      addTextBlock,
      deleteTextBlock,
      selectedPages,
      togglePageSelection,
      selectPageRange,
      clearPageSelection,
      reorderPages,
      addBlankPage,
      addPagesFromPdf,
      deletePages,
      duplicatePages,
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
    selectedBlockId: null,
    editingBlockId: null,
    editorMode: 'select',
  };
}
