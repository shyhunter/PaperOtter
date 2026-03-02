export type ToolId =
  | 'compress-pdf'
  | 'compress-image'
  | 'merge-pdf'
  | 'split-pdf'
  | 'rotate-pdf';

export type ToolCategory = 'pdf' | 'image';

export interface ToolStep {
  label: string;
  description: string;
}

export interface ToolDefinition {
  id: ToolId;
  name: string;
  description: string;
  category: ToolCategory;
  icon: string; // Lucide icon name (e.g., 'FileDown', 'Merge')
  acceptsFormats: Array<'pdf' | 'image'>;
  steps: ToolStep[];
}

export const TOOL_REGISTRY: Record<ToolId, ToolDefinition> = {
  'compress-pdf': {
    id: 'compress-pdf',
    name: 'Compress PDF',
    description: 'Reduce PDF file size with quality presets',
    category: 'pdf',
    icon: 'FileDown',
    acceptsFormats: ['pdf'],
    steps: [
      { label: 'Pick', description: 'Open a PDF file' },
      { label: 'Configure', description: 'Set compression options' },
      { label: 'Compare', description: 'Review output' },
      { label: 'Save', description: 'Save to disk' },
    ],
  },
  'compress-image': {
    id: 'compress-image',
    name: 'Compress Image',
    description: 'Resize and convert images with quality control',
    category: 'image',
    icon: 'ImageDown',
    acceptsFormats: ['image'],
    steps: [
      { label: 'Pick', description: 'Open an image file' },
      { label: 'Configure', description: 'Set image options' },
      { label: 'Compare', description: 'Review output' },
      { label: 'Save', description: 'Save to disk' },
    ],
  },
  'merge-pdf': {
    id: 'merge-pdf',
    name: 'Merge PDFs',
    description: 'Combine multiple PDFs into one document',
    category: 'pdf',
    icon: 'Merge',
    acceptsFormats: ['pdf'],
    steps: [
      { label: 'Pick Files', description: 'Select PDFs to merge' },
      { label: 'Order', description: 'Arrange page order' },
      { label: 'Save', description: 'Save merged PDF' },
    ],
  },
  'split-pdf': {
    id: 'split-pdf',
    name: 'Split PDF',
    description: 'Extract or separate pages from a PDF',
    category: 'pdf',
    icon: 'Scissors',
    acceptsFormats: ['pdf'],
    steps: [
      { label: 'Pick', description: 'Open a PDF file' },
      { label: 'Select Pages', description: 'Choose pages to extract' },
      { label: 'Save', description: 'Save extracted pages' },
    ],
  },
  'rotate-pdf': {
    id: 'rotate-pdf',
    name: 'Rotate PDF',
    description: 'Rotate individual or all pages in a PDF',
    category: 'pdf',
    icon: 'RotateCw',
    acceptsFormats: ['pdf'],
    steps: [
      { label: 'Pick', description: 'Open a PDF file' },
      { label: 'Select & Rotate', description: 'Choose pages and rotation' },
      { label: 'Save', description: 'Save rotated PDF' },
    ],
  },
};
