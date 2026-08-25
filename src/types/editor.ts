/** PDF editor types — used by the Edit PDF tool (Phase 13). */
import type { WatermarkOptions } from '@/lib/pdfWatermark';
import type { RedactionRect } from '@/components/redact-pdf/RedactOverlay';

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
  /** Remove identifying metadata (Info dictionary and XMP) when writing the
   * file. Off by default: saving must never change a document silently. */
  stripMetadataOnSave: boolean;
  /** Page count of the original document, so a revert can restore it after
   * pages were added or deleted. */
  originalPageCount: number;
  /** Bytes as they were immediately before page numbers were applied, or null.
   * Lets the page-numbers panel take them back off, and lets a colour change
   * re-derive from clean bytes instead of stacking a second set of numbers.
   * Dropped as soon as any other tool applies — see UPDATE_PDF_BYTES. */
  pageNumberBase: Uint8Array | null;
  /** The watermark currently being configured, or null when the watermark tool
   * is not open. Lives here rather than in the panel because the canvas has to
   * draw it too — that is the whole point of being able to drag it. Null does
   * double duty as "no overlay", so there is no second flag to keep in step. */
  watermarkDraft: WatermarkOptions | null;
  /** Rectangles marked for redaction, or null when the redact tool is not open.
   *  Same shape the standalone Redact tool uses, so both go through the same
   *  rasterising apply -- the one that actually destroys the content. */
  redactionDraft: RedactionRect[] | null;
  /** Colour the redaction boxes will be flattened in. */
  redactionColor: string;
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
