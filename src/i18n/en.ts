/**
 * The English dictionary — the source of truth for every user-facing string.
 *
 * Flat dotted keys rather than a nested object: they are greppable (searching
 * "compare.before" finds both the key and its use), and `keyof typeof en` gives
 * the whole key set to the type system for free, so a typo is a compile error
 * and a second language can only be a Partial of this.
 *
 * Keys are grouped by area with a `.` prefix. Plural entries come in `_one` /
 * `_other` pairs and are read through `plural()`, never `t()`.
 */
export const en = {
  // ── Common ────────────────────────────────────────────────────────────────
  'common.cancel': 'Cancel',
  'common.save': 'Save',

  // ── File input ────────────────────────────────────────────────────────────
  'file.tooLarge': 'This file is too large: {size}',
  'file.unsupported': 'Unsupported file type — please use PDF, JPG, PNG, or WebP.',
  'file.heicNeedsMacos':
    'HEIC photos can only be opened on macOS for now — convert it to JPEG first.',
  'file.unsafeName':
    "This filename contains characters that aren't supported. Please rename the file and try again.",

  // ── Redaction ─────────────────────────────────────────────────────────────
  'redaction.count_one': '{count} redaction',
  'redaction.count_other': '{count} redactions',

  // ── Image compare ───────────────────────────────────────────────────────
  'imageCompare.before': 'Before',
  'imageCompare.after': 'After',
  'imageCompare.original': 'Original',
  'imageCompare.processed': 'Processed',
  'common.loading': 'Loading…',
  'common.processing': 'Processing…',
  'imageCompare.regenerating': 'Regenerating…',
  'compare.copyStats': 'Copy processing stats to clipboard',
  'common.zoomIn': 'Zoom in',
  'common.zoomOut': 'Zoom out',
  'common.startOver': 'Start Over',
  'common.saveEllipsis': 'Save…',
  'common.back': 'Back',

  // ── PDF compare ─────────────────────────────────────────────────────────
  'compare.before': 'Before',
  'compare.after': 'After',
  'compare.rendering': 'Rendering preview…',
  'compare.unavailable': 'Preview unavailable',
  'compare.cancelled': 'Processing cancelled',
  'compare.cancelledDetail': 'The operation was stopped before completion.',
  'compare.backToConfigure': 'Back to Configure',
  'compare.backAndRetry': 'Back and try again',
  'common.retry': 'Retry',

  // ── PDF configure ───────────────────────────────────────────────────────
  'configure.optimiseSize': 'Optimise file size',
  'configure.compressionLevel': 'Compression level',
  'configure.customTargetSize': 'Custom target size',
  'configure.resizePages': 'Resize pages',
  'configure.enablePageResize': 'Enable page resize',
  'configure.enablePageResizeHint': 'Enable to change page dimensions — A4, A3, Letter, or custom size.',
  'configure.pageSize': 'Page size',
  'configure.widthMm': 'Width (mm)',
  'configure.heightMm': 'Height (mm)',
  'configure.pagesToResize': 'Pages to resize (leave blank for all)',
  'configure.pagesPlaceholder': 'e.g. 1-3, 5, 7-9',
  'configure.bestPresetAuto': 'Best preset auto-selected',

  // ── Save ────────────────────────────────────────────────────────────────
  'save.toFolder': 'Save to Folder',
  'save.asZip': 'Save as ZIP',
  'save.again': 'Save Again',
  'save.showInFinder': 'Show in Finder',
  'save.success': 'File saved successfully',
  'save.failed': 'Save failed',
  'common.tryAgain': 'Try Again',
  'common.dismiss': 'Dismiss',
  'save.backToCompare': 'Back to Compare',
  'save.chooseSplitMode': 'Choose how to save the split files.',
  'save.zipHint': 'All files bundled into a single ZIP archive',
  'save.individualHint': 'Each file saved individually with auto-naming',

  // ── Image configure ─────────────────────────────────────────────────────
  'imageConfigure.quality': 'Image quality',
  'imageConfigure.outputFormat': 'Output format',
  'imageConfigure.presets': 'Presets',
  'imageConfigure.resize': 'Resize',
  'imageConfigure.enableResize': 'Enable resize',
  'imageConfigure.enableResizeHint': 'Enable to change image dimensions — pixels or percentage scale.',
  'common.width': 'Width',
  'common.height': 'Height',

  // ── Privacy ─────────────────────────────────────────────────────────────
  'privacy.title': 'Your Privacy',
  'privacy.headline': 'Your files never leave your device.',
  'privacy.body': 'Papercut processes everything locally on your computer. No uploads, no cloud storage, no tracking.',
  'privacy.zeroData': 'We collect zero data — no analytics, no telemetry, no crash reports.',
  'privacy.technicalDetails': 'Technical details',
  'privacy.detailLocal': 'All file processing runs locally via Rust, Ghostscript, LibreOffice, and Calibre',
  'privacy.detailCsp': 'Content Security Policy blocks all external connections from the app\'s UI',
  'privacy.detailNoSdk': 'No analytics SDK or tracking code is included',
  'privacy.detailPasswords': 'Passwords (PDF protect/unlock) are never stored, logged, or written to disk',
  'privacy.detailTemp': 'Temporary files are created during processing and automatically deleted afterwards',
  'privacy.detailSweep': 'Leftover temp files from crashes are swept on app launch',
  'common.close': 'Close',

  // ── App chrome ──────────────────────────────────────────────────────────
  'chrome.about': 'About Papercut',
  'chrome.openAnother': 'Open another file',

  // ── rotateImage ─────────────────────────────────────────────────────────
  'rotateImage.left90': 'Left 90',
  'common.loadingDots': 'Loading...',
  'common.preview': 'Preview',
  'common.quality': 'Quality',
  'rotateImage.right90': 'Right 90',
  'rotateImage.rotateImage': 'Rotate Image',
  'rotateImage.rotating': 'Rotating...',
  'rotateImage.rotation': 'Rotation',
  'common.selectImage': 'Select Image',
  'rotateImage.selectAnImageToRotate': 'Select an image to rotate 90, 180, or 270 degrees.',

  // ── convertImage ────────────────────────────────────────────────────────
  'convertImage.convertImage': 'Convert Image',
  'convertImage.converting': 'Converting...',
  'convertImage.selectAnImageToConvert': 'Select an image to convert between formats.',

  // ── jpgToPdf ────────────────────────────────────────────────────────────
  'jpgToPdf.configurePdf': 'Configure PDF',
  'jpgToPdf.continue': 'Continue',
  'jpgToPdf.creatingPdf': 'Creating PDF...',
  'jpgToPdf.jpgToPdf': 'JPG to PDF',
  'jpgToPdf.loadingImages': 'Loading images...',
  'jpgToPdf.margin': 'Margin',
  'jpgToPdf.orientation': 'Orientation',
  'jpgToPdf.selectOneOrMoreImages': 'Select one or more images to convert into a single PDF.',

  // ── pdfToJpg ────────────────────────────────────────────────────────────
  'pdfToJpg.convertPdf': 'Convert PDF',
  'pdfToJpg.convertPdfPagesToImages': 'Convert PDF pages to images, Word, or ebook formats.',
  'pdfToJpg.deselectAll': 'Deselect All',
  'pdfToJpg.resolution': 'Resolution',
  'pdfToJpg.selectAll': 'Select All',
  'pdfToJpg.selectPdf': 'Select PDF',
  'pdfToJpg.selectPages': 'Select pages',

  // ── convertDoc ──────────────────────────────────────────────────────────
  'convertDoc.converted': 'Converted',
  'convertDoc.processAnother': 'Process Another',
  'convertDoc.save': 'Save...',

  // ── convertDoc ──────────────────────────────────────────────────────────
  'convertDoc.byChapter': 'By chapter',
  'convertDoc.detectingTools': 'Detecting tools...',
  'convertDoc.documentConversionRequiresACompatible': 'Document conversion requires a compatible application such as Microsoft Word, LibreOffice, or similar.',
  'convertDoc.epubLayout': 'EPUB Layout',
  'convertDoc.fixedLayout': 'Fixed Layout',
  'convertDoc.font': 'Font',
  'convertDoc.fontSize': 'Font size',
  'convertDoc.lineSpacing': 'Line spacing',
  'convertDoc.linkAll': 'Link all',
  'convertDoc.marginsMm': 'Margins (mm)',
  'convertDoc.noDocumentConverterFound': 'No document converter found',
  'convertDoc.noOutputFormatsAvailableFor': 'No output formats available for this file type.',
  'convertDoc.oneFile': 'One file',
  'convertDoc.output': 'Output',
  'convertDoc.preservesExactPageLayout': 'Preserves exact page layout',
  'convertDoc.reflowable': 'Reflowable',
  'convertDoc.textReflowsToFitScreen': 'Text reflows to fit screen',
  'convertDoc.typography': 'Typography',
  'convertDoc.wholeDocument': 'Whole document',

  // ── convertDoc ──────────────────────────────────────────────────────────
  'convertDoc.convertDocument': 'Convert Document',
  'convertDoc.convertToMarkdownHtmlJson': 'Convert to: Markdown, HTML, JSON, PDF, Word, e-books &amp; more',
  'convertDoc.openPdfDocxDocOdt': 'Open: PDF, DOCX, DOC, ODT, EPUB, MOBI, AZW3, TXT, RTF, HTML',
  'convertDoc.selectDocument': 'Select Document',
  'convertDoc.selectADocumentToConvert': 'Select a document to convert between formats.',
  'convertDoc.unsupportedFileFormatPleaseUse': 'Unsupported file format. Please use PDF, DOCX, DOC, ODT, EPUB, TXT, RTF, or HTML.',

  // ── cropPdf ─────────────────────────────────────────────────────────────
  'cropPdf.cropMargins': 'Crop Margins',
  'cropPdf.cropPdf': 'Crop PDF',
  'cropPdf.cropPreview': 'Crop preview',
  'cropPdf.cropping': 'Cropping...',
  'cropPdf.equalMargins': 'Equal margins',
  'cropPdf.loadingPreview': 'Loading preview...',
  'cropPdf.selectAPdfToCrop': 'Select a PDF to crop margins.',

  // ── merge ───────────────────────────────────────────────────────────────
  'merge.merging': 'Merging…',
  'common.moveDown': 'Move down',
  'common.moveUp': 'Move up',
  'merge.orderMerge': 'Order & Merge',

  // ── merge ───────────────────────────────────────────────────────────────
  'merge.addAtLeastOneMore': 'Add at least one more PDF to merge.',
  'merge.loadingPdfs': 'Loading PDFs…',
  'merge.mergePdfs': 'Merge PDFs',
  'merge.selectTwoOrMorePdfs': 'Select two or more PDFs to combine into one.',

  // ── organizePdf ─────────────────────────────────────────────────────────
  'organizePdf.delete': 'Delete',
  'organizePdf.duplicate': 'Duplicate',
  'organizePdf.organizePdf': 'Organize PDF',
  'organizePdf.processing': 'Processing...',
  'organizePdf.reorderDeleteOrDuplicatePages': 'Reorder, delete, or duplicate pages in a PDF.',
  'common.reset': 'Reset',
  'organizePdf.reverse': 'Reverse',

  // ── pageNumbers ─────────────────────────────────────────────────────────
  'common.applying': 'Applying...',
  'pageNumbers.colour': 'Colour',
  'common.fontSize': 'Font Size',
  'pageNumbers.format': 'Format',
  'common.generatingPreview': 'Generating preview...',
  'pageNumbers.pageNumberOptions': 'Page Number Options',
  'pageNumbers.pageNumbersPreview': 'Page numbers preview',
  'pageNumbers.position': 'Position',
  'common.previewWillAppearHere': 'Preview will appear here',
  'pageNumbers.startNumber': 'Start Number',

  // ── pageNumbers ─────────────────────────────────────────────────────────
  'pageNumbers.addPageNumbers': 'Add Page Numbers',
  'pageNumbers.selectAPdfToAdd': 'Select a PDF to add page numbers.',

  // ── pdfaConvert ─────────────────────────────────────────────────────────
  'pdfaConvert.conformanceLevel': 'Conformance Level',
  'pdfaConvert.convertAPdfToArchival': 'Convert a PDF to archival format for long-term preservation.',
  'pdfaConvert.convertToPdfA': 'Convert to PDF/A',
  'pdfaConvert.pdfAIsAnArchival': 'PDF/A is an archival format designed for long-term document preservation.',

  // ── protectPdf ──────────────────────────────────────────────────────────
  'protectPdf.addPasswordEncryptionToA': 'Add password encryption to a PDF file.',
  'protectPdf.confirmPassword': 'Confirm Password',
  'protectPdf.confirmPassword2': 'Confirm password',
  'protectPdf.encrypting': 'Encrypting...',
  'protectPdf.enterPassword': 'Enter password',
  'protectPdf.password': 'Password',
  'protectPdf.passwordsDoNotMatch': 'Passwords do not match.',
  'protectPdf.protectPdf': 'Protect PDF',
  'protectPdf.setPassword': 'Set Password',

  // ── redactPdf ───────────────────────────────────────────────────────────
  'redactPdf.removeRedaction': 'Remove redaction',

  // ── redactPdf ───────────────────────────────────────────────────────────
  'redactPdf.applyingRedactions': 'Applying redactions...',
  'redactPdf.redactPdf': 'Redact PDF',
  'redactPdf.redactedPagesHaveBeenFlattened': 'Redacted pages have been flattened to images. Text on those pages is no longer selectable.',
  'redactPdf.renderingPagesAndRemovingContent': 'Rendering pages and removing content permanently',
  'redactPdf.selectAPdfToPermanently': 'Select a PDF to permanently redact sensitive content.',

  // ── redactPdf ───────────────────────────────────────────────────────────
  'redactPdf.addAll': 'Add all',
  'redactPdf.boxColour': 'Box colour',
  'redactPdf.clearAll': 'Clear All',
  'redactPdf.drawRectanglesOnThePage': 'Draw rectangles on the page to mark areas for redaction. Use text search below to find and redact specific text.',
  'redactPdf.redactionTools': 'Redaction Tools',
  'redactPdf.searchText': 'Search text...',
  'redactPdf.summary': 'Summary',
  'redactPdf.textSearch': 'Text Search',

  // ── repairPdf ───────────────────────────────────────────────────────────
  'repairPdf.fixStructuralIssuesInCorrupted': 'Fix structural issues in corrupted or malformed PDFs.',
  'repairPdf.noIssuesDetectedFileAppears': 'No issues detected -- file appears healthy',
  'repairPdf.pdfRepair': 'PDF Repair',
  'repairPdf.repairPdf': 'Repair PDF',
  'repairPdf.repairCompleteIfTheDocument': 'Repair complete. If the document had structural issues, they have been addressed.',
  'repairPdf.repairing': 'Repairing...',

  // ── rotate ──────────────────────────────────────────────────────────────
  'common.rotatePages': 'Rotate Pages',
  'rotate.selectAPdfToRotate': 'Select a PDF to rotate individual or all pages.',

  // ── rotate ──────────────────────────────────────────────────────────────
  'rotate.allLeft': 'All Left',
  'rotate.allRight': 'All Right',
  'rotate.applying': 'Applying…',
  'rotate.left': 'Left',
  'rotate.right': 'Right',
  'rotate.rotateSelectedPagesLeft': 'Rotate selected pages left',
  'rotate.rotateSelectedPagesRight': 'Rotate selected pages right',

  // ── signPdf ─────────────────────────────────────────────────────────────
  'signPdf.addASignatureToYour': 'Add a signature to your PDF document.',
  'signPdf.couldNotReadThePdf': 'Could not read the PDF file.',
  'signPdf.signPdf': 'Sign PDF',

  // ── signPdf ─────────────────────────────────────────────────────────────
  'signPdf.clear': 'Clear',
  'common.useThisSignature': 'Use This Signature',

  // ── signPdf ─────────────────────────────────────────────────────────────
  'signPdf.createNew': 'Create New',
  'signPdf.createOrSelectSignature': 'Create or Select Signature',
  'signPdf.deleteSignature': 'Delete signature',
  'signPdf.ink': 'Ink',
  'signPdf.nameYourSignature': 'Name your signature',
  'signPdf.newSignature': 'New signature',
  'signPdf.noSavedSignatures': 'No saved signatures',
  'signPdf.savedSignatures': 'Saved Signatures',
  'signPdf.signatureName': 'Signature name...',

  // ── signPdf ─────────────────────────────────────────────────────────────
  'signPdf.allPages': 'All pages',
  'signPdf.applyTo': 'Apply To',
  'signPdf.currentPageOnly': 'Current page only',
  'signPdf.customRange': 'Custom range',
  'signPdf.pageNavigation': 'Page Navigation',
  'signPdf.pageSelector': 'Page selector',
  'signPdf.signature': 'Signature',

  // ── signPdf ─────────────────────────────────────────────────────────────
  'signPdf.typeYourNameOrSignature': 'Type your name or signature...',

  // ── signPdf ─────────────────────────────────────────────────────────────
  'signPdf.selectAnImageFilePng': 'Select an image file (PNG, JPG, or WebP)',
  'signPdf.signaturePreview': 'Signature preview',

  // ── split ───────────────────────────────────────────────────────────────
  'split.selectAPdfToSplit': 'Select a PDF to split into multiple files.',
  'split.splitPdf': 'Split PDF',

  // ── split ───────────────────────────────────────────────────────────────
  'split.extractEachPageAsA': 'Extract each page as a separate PDF.',
  'split.pageRangesEG1': 'Page ranges (e.g., 1-3, 5, 7-10)',
  'split.selectPages': 'Select Pages',
  'split.splitEveryNPages': 'Split every N pages',
  'split.splitting': 'Splitting…',

  // ── unlockPdf ───────────────────────────────────────────────────────────
  'unlockPdf.enterPassword': 'Enter Password',
  'unlockPdf.enterThePdfPassword': 'Enter the PDF password',
  'unlockPdf.pdfPassword': 'PDF Password',
  'unlockPdf.removePasswordProtectionFromA': 'Remove password protection from a PDF file.',
  'unlockPdf.unlockPdf': 'Unlock PDF',
  'unlockPdf.unlocking': 'Unlocking...',

  // ── watermark ───────────────────────────────────────────────────────────
  'watermark.addWatermark': 'Add Watermark',
  'watermark.color': 'Color',
  'watermark.enterWatermarkText': 'Enter watermark text',
  'watermark.selectAPdfToAdd': 'Select a PDF to add a text watermark.',
  'watermark.text': 'Text',
  'watermark.watermarkOptions': 'Watermark Options',
  'watermark.watermarkPreview': 'Watermark preview',
} as const;

/** Every key the app may ask for. A typo here is a compile error, not a blank. */
export type TranslationKey = keyof typeof en;

/**
 * A translation of English. Partial on purpose: an incomplete language is
 * normal, and every gap falls back to English rather than showing a raw key.
 */
export type Dictionary = Partial<Record<TranslationKey, string>>;

/**
 * The stems of plural entries — `redaction.count` for the `redaction.count_one`
 * / `redaction.count_other` pair. Derived from the dictionary, so `plural()`
 * only accepts a key that genuinely has plural forms, and `t()` cannot be used
 * on one by mistake.
 */
export type PluralKey =
  TranslationKey extends infer K
    ? K extends `${infer Stem}_other`
      ? Stem
      : never
    : never;
