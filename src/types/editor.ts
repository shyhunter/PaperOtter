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
  alignment: 'left' | 'center' | 'right';
  bold: boolean;
  italic: boolean;
  underline: boolean;
  isNew: boolean;
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
}

export interface EditorState {
  pdfBytes: Uint8Array;
  pages: PageEditState[];
  currentPage: number;
  isDirty: boolean;
}

export type EditorMode = 'select' | 'text' | 'image';
