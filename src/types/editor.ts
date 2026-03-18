/** PDF editor types — used by the Edit PDF tool (Phase 13). */

export interface TextBlock {
  id: string;
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  fontSize: number;
  fontName: string;
  color: string;
  alignment: 'left' | 'center' | 'right' | 'justify';
  bold: boolean;
  italic: boolean;
  underline: boolean;
  lineHeight: number;
  isNew: boolean;
  /** True when the block has been edited by the user (text changed, moved, styled, etc.) */
  isModified?: boolean;
}

/** Original bounds of a deleted block — needed to white-rect cover it in the saved PDF */
export interface DeletedBlock {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ImageBlock {
  id: string;
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  imageBytes: Uint8Array;
  rotation: 0 | 90 | 180 | 270;
  flipH: boolean;
  flipV: boolean;
  isNew: boolean;
}

export interface PageEditState {
  pageIndex: number;
  textBlocks: TextBlock[];
  imageBlocks: ImageBlock[];
  deletedTextIds: string[];
  deletedImageIds: string[];
  /** Original bounds of deleted text blocks — for white-rect coverage in save engine */
  deletedTextBlocks: DeletedBlock[];
  /** Original bounds of deleted image blocks */
  deletedImageBlocks: DeletedBlock[];
}

export interface EditorState {
  pdfBytes: Uint8Array;
  pages: PageEditState[];
  currentPage: number;
  isDirty: boolean;
}

export type EditorMode = 'select' | 'text' | 'image';

// ── Full-page PDF Editor types (Phase 16) ──────────────────────────────

export type ZoomPreset = 0.5 | 0.75 | 1.0 | 1.5 | 'fit-width';

export type CompareMode = 'off' | 'floating' | 'split' | 'slider';

export interface EditorViewState {
  pdfBytes: Uint8Array;
  /** Snapshot of the original PDF at load time — never modified after init */
  originalPdfBytes: Uint8Array;
  filePath: string | null;         // null until first save
  fileName: string;
  pageCount: number;
  zoom: number;                    // actual zoom level (0.25 - 3.0)
  zoomPreset: ZoomPreset | null;   // null if manual zoom
  currentPage: number;             // 0-based, tracks scroll position
  isDirty: boolean;
  pages: PageEditState[];
  // Text editing state (Phase 16 Plan 03)
  selectedBlockId: string | null;
  editingBlockId: string | null;
  editorMode: EditorMode;
  compareMode: CompareMode;
}
