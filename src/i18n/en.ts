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

  // ── editPdf ─────────────────────────────────────────────────────────────
  'editPdf.editPdf': 'Edit PDF',
  'editPdf.saveChanges': 'Save changes',
  'editPdf.selectAPdfToEdit': 'Select a PDF to edit text and images.',
  'common.unsavedChanges': 'Unsaved changes',

  // ── editPdf ─────────────────────────────────────────────────────────────
  'editPdf.edit': 'Edit',
  'editPdf.export': 'Export',
  'editPdf.fitToWidth': 'Fit to width',
  'common.nextPage': 'Next page',
  'editPdf.pageNumber': 'Page number',
  'common.previousPage': 'Previous page',

  // ── editPdf ─────────────────────────────────────────────────────────────
  'editPdf.addTextMode': 'Add text mode',
  'editPdf.alignment': 'Alignment',
  'common.bold': 'Bold',
  'editPdf.clickInsertImageToAdd': 'Click "Insert Image" to add an image, or select an existing image to edit it.',
  'editPdf.clickATextBlockOr': 'Click a text block or image on the page to select and edit it.',
  'editPdf.clickAnywhereOnThePage': 'Click anywhere on the page to add a new text block.',
  'editPdf.currentColor': 'Current Color',
  'editPdf.customColors': 'Custom Colors',
  'editPdf.deleteImage': 'Delete Image',
  'editPdf.deleteText': 'Delete Text',
  'editPdf.flip': 'Flip',
  'editPdf.flipHorizontal': 'Flip horizontal',
  'editPdf.flipVertical': 'Flip vertical',
  'editPdf.imageMode': 'Image mode',
  'editPdf.insertImage': 'Insert Image',
  'common.italic': 'Italic',
  'editPdf.mode': 'Mode',
  'editPdf.pickColor': 'Pick color',
  'editPdf.redo': 'Redo',
  'editPdf.replaceImage': 'Replace Image',
  'editPdf.rotate': 'Rotate',
  'editPdf.rotate180': 'Rotate 180',
  'editPdf.rotate90Clockwise': 'Rotate 90 clockwise',
  'editPdf.rotate90CounterClockwise': 'Rotate 90 counter-clockwise',
  'editPdf.saveCurrentColor': 'Save current color',
  'editPdf.select': 'Select',
  'editPdf.selectImageFileToInsert': 'Select image file to insert',
  'editPdf.selectMode': 'Select mode',
  'editPdf.selectReplacementImage': 'Select replacement image',
  'common.size': 'Size',
  'common.style': 'Style',
  'common.underline': 'Underline',
  'editPdf.undo': 'Undo',

  // ── editPdf ─────────────────────────────────────────────────────────────
  'editPdf.exportConvert': 'Export / Convert',
  'editPdf.noDocumentConverterFoundInstall': 'No document converter found. Install any converter (Microsoft Word, LibreOffice, etc.) to enable export.',
  'editPdf.pendingEditsWillBeApplied': 'Pending edits will be applied before export.',
  'editPdf.sizePt': 'Size (pt)',

  // ── editPdf ─────────────────────────────────────────────────────────────
  'editPdf.image': 'Image',

  // ── editPdf ─────────────────────────────────────────────────────────────
  'editPdf.editTextBlock': 'Edit text block',

  // ── editPdf ─────────────────────────────────────────────────────────────
  'editPdf.collapseSidebar': 'Collapse sidebar',
  'editPdf.expandSidebar': 'Expand sidebar',
  'editPdf.goToPageNumber': 'Go to page number',
  'editPdf.goTo': 'Go to:',
  'common.pages': 'Pages',

  // ── pdfEditor ───────────────────────────────────────────────────────────
  'pdfEditor.closeComparisonEsc': 'Close comparison (Esc)',
  'pdfEditor.compareOriginalVsCurrent': 'Compare: Original vs Current',
  'pdfEditor.current': 'Current',
  'pdfEditor.renderingPreview': 'Rendering preview...',

  // ── pdfEditor ───────────────────────────────────────────────────────────
  'pdfEditor.beforeAfter': 'Before / After',
  'pdfEditor.beforeAfterComparison': 'Before / After Comparison',
  'pdfEditor.comparisonSlider': 'Comparison slider',
  'pdfEditor.minimize': 'Minimize',
  'pdfEditor.overlaySlider': 'Overlay slider',
  'pdfEditor.sideBySide': 'Side by side',

  // ── pdfEditor ───────────────────────────────────────────────────────────
  'pdfEditor.compare': 'Compare',
  'pdfEditor.dashboard': 'Dashboard',
  'pdfEditor.discardAllChangesAndRestore': 'Discard all changes and restore the document as it was opened',
  'pdfEditor.revert': 'Revert',
  'pdfEditor.saveCmdS': 'Save (Cmd+S)',
  'pdfEditor.saved': 'Saved',
  'pdfEditor.toggleCompareViewOriginalVs': 'Toggle compare view (original vs edited)',

  // ── pdfEditor ───────────────────────────────────────────────────────────
  'pdfEditor.backToDashboard': 'Back to Dashboard',
  'pdfEditor.loadingPdf': 'Loading PDF...',
  'pdfEditor.unableToOpenFile': 'Unable to open file',

  // ── pdfEditor ───────────────────────────────────────────────────────────
  'pdfEditor.addTextModeClickOn': 'Add text mode (click on page to add)',
  'pdfEditor.decreaseFontSize': 'Decrease font size',
  'pdfEditor.increaseFontSize': 'Increase font size',
  'pdfEditor.textColor': 'Text color',

  // ── pdfEditor ───────────────────────────────────────────────────────────
  'pdfEditor.placedSignature': 'Placed signature',

  // ── pdfEditor ───────────────────────────────────────────────────────────
  'pdfEditor.blankPage': 'Blank page',
  'pdfEditor.collapsePagePanel': 'Collapse page panel',
  'pdfEditor.deleteSelectedPages': 'Delete selected pages',
  'pdfEditor.duplicateSelectedPages': 'Duplicate selected pages',
  'pdfEditor.expandPagePanel': 'Expand page panel',
  'pdfEditor.fromPdfFile': 'From PDF file...',
  'pdfEditor.insertPage': 'Insert page',
  'pdfEditor.movePageDown': 'Move page down',
  'pdfEditor.movePageUp': 'Move page up',

  // ── pdfEditor ───────────────────────────────────────────────────────────
  'pdfEditor.failedToSave': 'Failed to save',
  'pdfEditor.saving': 'Saving...',

  // ── pdfEditor ───────────────────────────────────────────────────────────
  'pdfEditor.allEqual': 'All equal',
  'pdfEditor.allMarginsMm': 'All margins (mm)',
  'pdfEditor.allSides': 'All sides',
  'pdfEditor.applied': 'Applied',
  'pdfEditor.applyToAllPages': 'Apply to all pages',
  'pdfEditor.attemptToFixCorruptedOr': 'Attempt to fix corrupted or malformed PDF structure using Ghostscript.',
  'pdfEditor.bottomCenter': 'Bottom Center',
  'pdfEditor.bottomLeft': 'Bottom Left',
  'pdfEditor.bottomRight': 'Bottom Right',
  'pdfEditor.clearAll': 'Clear all',
  'pdfEditor.clickAnywhereOnThePdf': 'Click anywhere on the PDF to place a text block.',
  'pdfEditor.compareFullSize': 'Compare full size',
  'pdfEditor.compressed': 'Compressed',
  'pdfEditor.currentSize': 'Current size',
  'pdfEditor.deleteSavedSignature': 'Delete saved signature',
  'pdfEditor.direction': 'Direction',
  'pdfEditor.enterPdfPassword': 'Enter PDF password',
  'pdfEditor.findText': 'Find text',
  'pdfEditor.findTextToRedact': 'Find text to redact',
  'pdfEditor.keepImageResolution': 'Keep image resolution',
  'pdfEditor.nameNumber': 'Name, number…',
  'pdfEditor.options': 'Options',
  'pdfEditor.pdfIsNowPasswordProtected': 'PDF is now password-protected',
  'pdfEditor.pdfPasswordProtectionRemoved': 'PDF password protection removed',
  'pdfEditor.pdfALevel': 'PDF/A Level',
  'pdfEditor.pdfAConformanceLevel': 'PDF/A conformance level',
  'pdfEditor.pdfA1MostCompatible': 'PDF/A-1 (most compatible)',
  'pdfEditor.pdfA2Recommended': 'PDF/A-2 (recommended)',
  'pdfEditor.pdfA3FullFeatures': 'PDF/A-3 (full features)',
  'pdfEditor.passwordsDoNotMatch': 'Passwords do not match',
  'pdfEditor.placeOnPage': 'Place on Page',
  'pdfEditor.placementModeActive': 'Placement Mode Active',
  'pdfEditor.qualityPreset': 'Quality Preset',
  'pdfEditor.reduction': 'Reduction',
  'pdfEditor.removePageNumbers': 'Remove page numbers',
  'pdfEditor.saveSignatureForReuse': 'Save signature for reuse',
  'pdfEditor.signatureFontSize': 'Signature font size',
  'pdfEditor.signatureText': 'Signature text',
  'pdfEditor.sizeChange': 'Size change',
  'pdfEditor.sizeUnit': 'Size unit',
  'pdfEditor.startAt': 'Start At',
  'pdfEditor.startAt2': 'Start at',
  'pdfEditor.target': 'Target',
  'pdfEditor.targetFileSize': 'Target file size',
  'pdfEditor.toolPanelNotYetImplemented': 'Tool panel not yet implemented.',
  'pdfEditor.topCenter': 'Top Center',
  'pdfEditor.topLeft': 'Top Left',
  'pdfEditor.topRight': 'Top Right',
  'pdfEditor.typeYourSignature': 'Type your signature',
  'pdfEditor.yourName': 'Your Name',

  // ── pdfEditor ───────────────────────────────────────────────────────────
  'pdfEditor.fullComparisonView': 'Full comparison view',
  'pdfEditor.pending': 'Pending',

  // ── pdfEditor ───────────────────────────────────────────────────────────
  'pdfEditor.dragToMove': 'Drag to move',
  'pdfEditor.dragToResize': 'Drag to resize',
  'pdfEditor.dragToRotateHoldShift': 'Drag to rotate — hold Shift to snap',

  // ── pdfEditor ───────────────────────────────────────────────────────────
  'pdfEditor.zoomInCmd': 'Zoom in (Cmd+=)',
  'pdfEditor.zoomOutCmd': 'Zoom out (Cmd+-)',
  'pdfEditor.zoomPresets': 'Zoom presets',

  // ── app ─────────────────────────────────────────────────────────────────
  'app.couldNotOpenFilePicker': 'Could not open file picker',
  'app.thisFileAppearsToBe': 'This file appears to be corrupt. Please try a different file.',

  // ── aboutDialog ─────────────────────────────────────────────────────────
  'aboutDialog.allProcessingHappensLocallyNo': 'All processing happens locally. No data ever leaves your computer.',
  'aboutDialog.builtWith': 'Built with',
  'aboutDialog.license': 'License',
  'aboutDialog.sendFeedback': 'Send Feedback',
  'common.yourLocalDocumentToolkitPrivate': 'Your local document toolkit — private, fast, offline.',

  // ── buyMeAcoffeeButton ──────────────────────────────────────────────────
  'buyMeAcoffeeButton.buyMeACoffee': 'Buy me a coffee',

  // ── colorPicker ─────────────────────────────────────────────────────────
  'colorPicker.customColour': 'Custom colour',

  // ── crashReporter ───────────────────────────────────────────────────────
  'crashReporter.anUnexpectedErrorOccurredYou': 'An unexpected error occurred. You can send a crash report to help us fix it.',
  'crashReporter.sendCrashReport': 'Send Crash Report',
  'crashReporter.somethingWentWrong': 'Something went wrong',
  'crashReporter.theReportOpensAsA': 'The report opens as a draft email. Nothing is sent until you send it yourself.',
  'crashReporter.thisWillOpenInYour': 'This will open in your email app:',

  // ── dashboard ───────────────────────────────────────────────────────────
  'dashboard.clickToReorderMiddotClick': 'Click ⠿ to reorder &middot; Click &#9733; on any tool to add',
  'dashboard.dropFileToGetStarted': 'Drop file to get started',
  'dashboard.myFavorites': 'My Favorites',
  'dashboard.readyToProcessChooseA': 'Ready to process — choose a tool below',
  'dashboard.removeFromFavorites': 'Remove from favorites',
  'dashboard.searchTools': 'Search tools...',
  'dashboard.swapHere': 'Swap here',

  // ── firstLaunchBanner ───────────────────────────────────────────────────
  'firstLaunchBanner.dismissPrivacyBanner': 'Dismiss privacy banner',
  'firstLaunchBanner.learnMore': 'Learn more',

  // ── landingCard ─────────────────────────────────────────────────────────
  'landingCard.compressResizeConvertStaysOn': 'Compress, resize, convert — stays on your device',
  'landingCard.damagedOrInvalidPdf': 'Damaged or Invalid PDF',
  'landingCard.fileTooLarge': 'File too large',
  'landingCard.loadingFile': 'Loading file...',
  'landingCard.openFile': 'Open file',
  'landingCard.pdfJpgPngWebp': 'PDF, JPG, PNG, WebP',
  'landingCard.pickADifferentFile': 'Pick a Different File',
  'landingCard.repairWithRepairPdf': 'Repair with Repair PDF →',

  // ── privacyFooter ───────────────────────────────────────────────────────
  'privacyFooter.processedLocallyPrivacy': 'Processed locally · Privacy',

  // ── recentDirsButton ────────────────────────────────────────────────────
  'recentDirsButton.recent': 'Recent',
  'recentDirsButton.recentFolders': 'Recent folders',

  // ── splashScreen ────────────────────────────────────────────────────────
  'splashScreen.papercutLogo': 'Papercut logo',
  'splashScreen.yourLocalDocumentToolkitPrivate': 'Your local document toolkit — private, fast, offline',

  // ── updateChecker ───────────────────────────────────────────────────────
  'updateChecker.dismissUpdateBanner': 'Dismiss update banner',
  'updateChecker.download': 'Download',

  // ── Counts ──────────────────────────────────────────────────────────────────
  // Read through plural(), never t(). The category comes from Intl.PluralRules,
  // so a language needing _few or _many simply adds those entries.
  'count.page_one': '{count} page',
  'count.page_other': '{count} pages',
  'count.file_one': '{count} file',
  'count.file_other': '{count} files',
  'count.image_one': '{count} image',
  'count.image_other': '{count} images',
  'count.redaction_one': '{count} redaction',
  'count.redaction_other': '{count} redactions',

  // ── support ─────────────────────────────────────────────────────────────
  'support.buyMeACoffee': 'Buy me a coffee',

  // ── recentDirs ──────────────────────────────────────────────────────────
  'recentDirs.recentFolders': 'Recent folders',

  // ── editorToolbar ───────────────────────────────────────────────────────
  'common.undo': 'Undo',
  'common.redo': 'Redo',

  // ── toolSidebar ─────────────────────────────────────────────────────────
  'toolSidebar.targetFileSize': 'Target file size',
} as const;

/** Every key the app may ask for. A typo here is a compile error, not a blank. */
export type TranslationKey = keyof typeof en;

/**
 * A translation of English. Partial on purpose: an incomplete language is
 * normal, and every gap falls back to English rather than showing a raw key.
 */
export type Dictionary = Partial<Record<TranslationKey, string>>;

/**
 * The stems of plural entries — `count.page` for the `count.page_one` /
 * `count.page_other` pair. Derived from the dictionary, so `plural()`
 * only accepts a key that genuinely has plural forms, and `t()` cannot be used
 * on one by mistake.
 */
export type PluralKey =
  TranslationKey extends infer K
    ? K extends `${infer Stem}_other`
      ? Stem
      : never
    : never;
