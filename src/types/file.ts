export type SupportedFormat = 'pdf' | 'image';

export interface FileEntry {
  path: string;
  format: SupportedFormat;
  name: string;
}

export type AppStep = 0 | 1 | 2 | 3; // Pick=0, Configure=1, Compare=2, Save=3

export type DragState = 'idle' | 'over-valid' | 'over-invalid';
