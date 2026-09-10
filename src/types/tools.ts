import type { TranslationKey } from '@/i18n';

import type { Platform } from '@/lib/platform';

export type ToolId =
  | 'compress-pdf'
  | 'compress-image'
  | 'merge-pdf'
  | 'split-pdf'
  | 'rotate-pdf'
  | 'pdf-to-jpg'
  | 'jpg-to-pdf'
  | 'rotate-image'
  | 'convert-image'
  | 'page-numbers'
  | 'watermark'
  | 'crop-pdf'
  | 'organize-pdf'
  | 'sign-pdf'
  | 'redact-pdf'
  | 'repair-pdf'
  | 'ocr-pdf'
  | 'edit-pdf'
  | 'convert-doc';

export type ToolCategory = 'pdf' | 'image' | 'document';

export interface ToolStep {
  /** Translation key, not prose — resolved with t() at render time. */
  label: TranslationKey;
  /** Translation key, not prose — resolved with t() at render time. */
  description: TranslationKey;
}

export type DependencyName = 'ghostscript' | 'calibre' | 'libreoffice';

export interface ToolDefinition {
  id: ToolId;
  /**
   * Translation keys, not prose. The registry is a module-level constant, so
   * calling t() here would resolve once at import and freeze English forever;
   * consumers resolve these at render time instead.
   */
  name: TranslationKey;
  description: TranslationKey;
  category: ToolCategory;
  icon: string; // Lucide icon name (e.g., 'FileDown', 'Merge')
  acceptsFormats: Array<'pdf' | 'image' | 'document'>;
  acceptsMultipleFiles?: boolean;
  steps: ToolStep[];
  /** External dependency required to use this tool. Tool is disabled if not installed. */
  requiresDependency?: DependencyName;
  /**
   * Platforms this tool can run on. Absent means all of them.
   *
   * Different in kind from `requiresDependency`: a missing dependency is a
   * thing the user can install, so the tool is shown disabled with a hint. A
   * missing platform engine is not installable, so the tool is hidden entirely.
   * See isToolAvailableHere in src/lib/platform.ts.
   */
  requiresPlatform?: Platform[];
}

export const TOOL_REGISTRY: Record<ToolId, ToolDefinition> = {
  'compress-pdf': {
    id: 'compress-pdf',
    name: 'tool.compressPdf.name',
    description: 'tool.compressPdf.desc',
    category: 'pdf',
    icon: 'FileDown',
    acceptsFormats: ['pdf'],
    requiresDependency: 'ghostscript',
    steps: [
      { label: 'step.pick', description: 'tool.compressPdf.step1' },
      { label: 'step.configure', description: 'tool.compressPdf.step2' },
      { label: 'step.compare', description: 'tool.compressPdf.step3' },
      { label: 'step.save', description: 'tool.compressPdf.step4' },
    ],
  },
  'compress-image': {
    id: 'compress-image',
    name: 'tool.compressImage.name',
    description: 'tool.compressImage.desc',
    category: 'image',
    icon: 'ImageDown',
    acceptsFormats: ['image'],
    steps: [
      { label: 'step.pick', description: 'tool.compressImage.step1' },
      { label: 'step.configure', description: 'tool.compressImage.step2' },
      { label: 'step.compare', description: 'tool.compressImage.step3' },
      { label: 'step.save', description: 'tool.compressImage.step4' },
    ],
  },
  'merge-pdf': {
    id: 'merge-pdf',
    name: 'tool.mergePdf.name',
    description: 'tool.mergePdf.desc',
    category: 'pdf',
    icon: 'Merge',
    acceptsFormats: ['pdf'],
    acceptsMultipleFiles: true,
    steps: [
      { label: 'step.pickFiles', description: 'tool.mergePdf.step1' },
      { label: 'step.order', description: 'tool.mergePdf.step2' },
      { label: 'step.save', description: 'tool.mergePdf.step3' },
    ],
  },
  'split-pdf': {
    id: 'split-pdf',
    name: 'tool.splitPdf.name',
    description: 'tool.splitPdf.desc',
    category: 'pdf',
    icon: 'Scissors',
    acceptsFormats: ['pdf'],
    steps: [
      { label: 'step.pick', description: 'tool.splitPdf.step1' },
      { label: 'step.selectPages', description: 'tool.splitPdf.step2' },
      { label: 'step.save', description: 'tool.splitPdf.step3' },
    ],
  },
  'rotate-pdf': {
    id: 'rotate-pdf',
    name: 'tool.rotatePdf.name',
    description: 'tool.rotatePdf.desc',
    category: 'pdf',
    icon: 'RotateCw',
    acceptsFormats: ['pdf'],
    steps: [
      { label: 'step.pick', description: 'tool.rotatePdf.step1' },
      { label: 'step.selectRotate', description: 'tool.rotatePdf.step2' },
      { label: 'step.save', description: 'tool.rotatePdf.step3' },
    ],
  },
  'pdf-to-jpg': {
    id: 'pdf-to-jpg',
    name: 'tool.pdfToJpg.name',
    description: 'tool.pdfToJpg.desc',
    category: 'pdf',
    icon: 'FileImage',
    acceptsFormats: ['pdf'],
    steps: [
      { label: 'step.pick', description: 'tool.pdfToJpg.step1' },
      { label: 'step.configure', description: 'tool.pdfToJpg.step2' },
      { label: 'step.save', description: 'tool.pdfToJpg.step3' },
    ],
  },
  'jpg-to-pdf': {
    id: 'jpg-to-pdf',
    name: 'tool.jpgToPdf.name',
    description: 'tool.jpgToPdf.desc',
    category: 'pdf',
    icon: 'FilePlus2',
    acceptsFormats: ['image'],
    acceptsMultipleFiles: true,
    steps: [
      { label: 'step.pickImages', description: 'tool.jpgToPdf.step1' },
      { label: 'step.configure', description: 'tool.jpgToPdf.step2' },
      { label: 'step.save', description: 'tool.jpgToPdf.step3' },
    ],
  },
  'rotate-image': {
    id: 'rotate-image',
    name: 'tool.rotateImage.name',
    description: 'tool.rotateImage.desc',
    category: 'image',
    icon: 'RotateCw',
    acceptsFormats: ['image'],
    steps: [
      { label: 'step.pick', description: 'tool.rotateImage.step1' },
      { label: 'step.rotate', description: 'tool.rotateImage.step2' },
      { label: 'step.save', description: 'tool.rotateImage.step3' },
    ],
  },
  'convert-image': {
    id: 'convert-image',
    name: 'tool.convertImage.name',
    description: 'tool.convertImage.desc',
    category: 'image',
    icon: 'ArrowLeftRight',
    acceptsFormats: ['image'],
    steps: [
      { label: 'step.pick', description: 'tool.convertImage.step1' },
      { label: 'step.configure', description: 'tool.convertImage.step2' },
      { label: 'step.save', description: 'tool.convertImage.step3' },
    ],
  },
  'page-numbers': {
    id: 'page-numbers',
    name: 'tool.pageNumbers.name',
    description: 'tool.pageNumbers.desc',
    category: 'pdf',
    icon: 'Hash',
    acceptsFormats: ['pdf'],
    steps: [
      { label: 'step.pick', description: 'tool.pageNumbers.step1' },
      { label: 'step.configure', description: 'tool.pageNumbers.step2' },
      { label: 'step.save', description: 'tool.watermark.step1' },
    ],
  },
  'watermark': {
    id: 'watermark',
    name: 'tool.watermark.name',
    description: 'tool.watermark.desc',
    category: 'pdf',
    icon: 'Stamp',
    acceptsFormats: ['pdf'],
    steps: [
      { label: 'step.pick', description: 'tool.watermark.step2' },
      { label: 'step.configure', description: 'tool.watermark.step2' },
      { label: 'step.save', description: 'tool.cropPdf.step1' },
    ],
  },
  'crop-pdf': {
    id: 'crop-pdf',
    name: 'tool.cropPdf.name',
    description: 'tool.cropPdf.desc',
    category: 'pdf',
    icon: 'Crop',
    acceptsFormats: ['pdf'],
    steps: [
      { label: 'step.pick', description: 'tool.cropPdf.step2' },
      { label: 'step.crop', description: 'tool.cropPdf.step2' },
      { label: 'step.save', description: 'tool.organizePdf.step1' },
    ],
  },
  'organize-pdf': {
    id: 'organize-pdf',
    name: 'tool.organizePdf.name',
    description: 'tool.organizePdf.desc',
    category: 'pdf',
    icon: 'LayoutGrid',
    acceptsFormats: ['pdf'],
    steps: [
      { label: 'step.pick', description: 'tool.organizePdf.step2' },
      { label: 'step.organize', description: 'tool.organizePdf.step2' },
      { label: 'step.save', description: 'tool.signPdf.step1' },
    ],
  },
  'sign-pdf': {
    id: 'sign-pdf',
    name: 'tool.signPdf.name',
    description: 'tool.signPdf.desc',
    category: 'pdf',
    icon: 'PenTool',
    acceptsFormats: ['pdf'],
    steps: [
      { label: 'step.selectPdf', description: 'tool.signPdf.step2' },
      { label: 'step.signature', description: 'tool.signPdf.step3' },
      { label: 'step.place', description: 'tool.signPdf.step3' },
      { label: 'step.save', description: 'tool.redactPdf.step1' },
    ],
  },
  'redact-pdf': {
    id: 'redact-pdf',
    name: 'tool.redactPdf.name',
    description: 'tool.redactPdf.desc',
    category: 'pdf',
    icon: 'EyeOff',
    acceptsFormats: ['pdf'],
    steps: [
      { label: 'step.selectPdf', description: 'tool.redactPdf.step2' },
      { label: 'step.redact', description: 'tool.redactPdf.step2' },
      { label: 'step.save', description: 'tool.pdfaConvert.step1' },
    ],
  },
  'repair-pdf': {
    id: 'repair-pdf',
    name: 'tool.repairPdf.name',
    description: 'tool.repairPdf.desc',
    category: 'pdf',
    icon: 'Wrench',
    acceptsFormats: ['pdf'],
    requiresDependency: 'ghostscript',
    steps: [
      { label: 'step.selectPdf', description: 'tool.repairPdf.step2' },
      { label: 'step.repair', description: 'tool.editPdf.step1' },
      { label: 'step.save', description: 'tool.editPdf.step2' },
    ],
  },
  'ocr-pdf': {
    id: 'ocr-pdf',
    // macOS Vision is the only engine that exists today. Tesseract for Windows
    // and Linux is planned (PLATFORM_PARITY.md phase 3); until it lands this
    // tool is hidden off macOS rather than shown and broken.
    requiresPlatform: ['macos'],
    name: 'tool.ocrPdf.name',
    description: 'tool.ocrPdf.desc',
    category: 'pdf',
    // Eye against redact's EyeOff, on purpose: redaction takes content out of
    // sight, this puts content the machine could not see back within reach.
    icon: 'Eye',
    acceptsFormats: ['pdf'],
    steps: [
      { label: 'step.selectPdf', description: 'tool.ocrPdf.step1' },
      { label: 'step.recognise', description: 'tool.ocrPdf.step2' },
      { label: 'step.save', description: 'tool.ocrPdf.step3' },
    ],
  },
  'edit-pdf': {
    id: 'edit-pdf',
    name: 'tool.editPdf.name',
    description: 'tool.editPdf.desc',
    category: 'pdf',
    icon: 'FileEdit',
    acceptsFormats: ['pdf'],
    steps: [
      { label: 'step.pick', description: 'tool.editPdf.step3' },
      { label: 'step.edit', description: 'tool.convertDoc.step1' },
      { label: 'step.save', description: 'tool.convertDoc.step2' },
    ],
  },
  'convert-doc': {
    id: 'convert-doc',
    name: 'tool.convertDoc.name',
    description: 'tool.convertDoc.desc',
    category: 'document',
    icon: 'ArrowLeftRight',
    acceptsFormats: ['pdf', 'document'],
    // Deliberately no requiresDependency. Calibre is needed for EPUB, MOBI and
    // AZW3 only; PDF and DOCX convert to Markdown, HTML, JSON, TXT and DOCX
    // entirely in-process. Gating the card on Calibre made eight working
    // formats unreachable on any machine without it, which is what a user hit
    // on Linux. Per-format availability is handled by listAllOutputFormats.
    steps: [
      { label: 'step.pick', description: 'tool.convertDoc.step3' },
      { label: 'step.configure', description: 'tool.convertDoc.step4' },
      { label: 'step.compare', description: 'tool.convertDoc.step5' },
      { label: 'step.save', description: 'tool.convertDoc.step6' },
    ],
  },
};

/**
 * PDF tools shown in the editor sidebar, in display order.
 * Excludes merge-pdf (needs multiple files), split-pdf (produces multiple outputs),
 * pdf-to-jpg, jpg-to-pdf, and edit-pdf (handled by the editor canvas itself).
 */
export const EDITOR_SIDEBAR_TOOLS: ToolId[] = [
  'compress-pdf',
  'rotate-pdf',
  'page-numbers',
  'watermark',
  'crop-pdf',
  'sign-pdf',
  'redact-pdf',
  'ocr-pdf',
  'repair-pdf',
];
