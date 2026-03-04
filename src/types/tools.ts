export type ToolId =
  | 'compress-pdf'
  | 'compress-image'
  | 'merge-pdf'
  | 'split-pdf'
  | 'rotate-pdf'
  | 'pdf-to-jpg'
  | 'jpg-to-pdf'
  | 'protect-pdf'
  | 'unlock-pdf'
  | 'rotate-image'
  | 'convert-image';

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
  acceptsMultipleFiles?: boolean;
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
    acceptsMultipleFiles: true,
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
  'pdf-to-jpg': {
    id: 'pdf-to-jpg',
    name: 'PDF to JPG',
    description: 'Export PDF pages as JPEG or PNG images',
    category: 'pdf',
    icon: 'FileImage',
    acceptsFormats: ['pdf'],
    steps: [
      { label: 'Pick', description: 'Open a PDF file' },
      { label: 'Configure', description: 'Set format and quality' },
      { label: 'Save', description: 'Save images' },
    ],
  },
  'jpg-to-pdf': {
    id: 'jpg-to-pdf',
    name: 'JPG to PDF',
    description: 'Convert images into a single PDF document',
    category: 'pdf',
    icon: 'FilePlus2',
    acceptsFormats: ['image'],
    acceptsMultipleFiles: true,
    steps: [
      { label: 'Pick Images', description: 'Select images to convert' },
      { label: 'Configure', description: 'Set page size and layout' },
      { label: 'Save', description: 'Save PDF' },
    ],
  },
  'protect-pdf': {
    id: 'protect-pdf',
    name: 'Protect PDF',
    description: 'Add password encryption to a PDF',
    category: 'pdf',
    icon: 'Lock',
    acceptsFormats: ['pdf'],
    steps: [
      { label: 'Pick', description: 'Open a PDF file' },
      { label: 'Password', description: 'Set a password' },
      { label: 'Save', description: 'Save protected PDF' },
    ],
  },
  'unlock-pdf': {
    id: 'unlock-pdf',
    name: 'Unlock PDF',
    description: 'Remove password protection from a PDF',
    category: 'pdf',
    icon: 'Unlock',
    acceptsFormats: ['pdf'],
    steps: [
      { label: 'Pick', description: 'Open a PDF file' },
      { label: 'Password', description: 'Enter the password' },
      { label: 'Save', description: 'Save unlocked PDF' },
    ],
  },
  'rotate-image': {
    id: 'rotate-image',
    name: 'Rotate Image',
    description: 'Rotate images 90°, 180°, or 270°',
    category: 'image',
    icon: 'RotateCw',
    acceptsFormats: ['image'],
    steps: [
      { label: 'Pick', description: 'Open an image file' },
      { label: 'Rotate', description: 'Choose rotation angle' },
      { label: 'Save', description: 'Save rotated image' },
    ],
  },
  'convert-image': {
    id: 'convert-image',
    name: 'Convert Image',
    description: 'Convert between JPG, PNG, and WebP formats',
    category: 'image',
    icon: 'ArrowLeftRight',
    acceptsFormats: ['image'],
    steps: [
      { label: 'Pick', description: 'Open an image file' },
      { label: 'Configure', description: 'Choose output format' },
      { label: 'Save', description: 'Save converted image' },
    ],
  },
};
