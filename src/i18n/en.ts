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

  // ── Tools registry ──────────────────────────────────────────────────────
  'tool.compressPdf.name': 'Compress PDF',
  'tool.compressPdf.desc': 'Reduce PDF file size with quality presets',
  'step.pick': 'Pick',
  'tool.compressPdf.step1': 'Open a PDF file',
  'step.configure': 'Configure',
  'tool.compressPdf.step2': 'Set compression options',
  'step.compare': 'Compare',
  'tool.compressPdf.step3': 'Review output',
  'step.save': 'Save',
  'tool.compressPdf.step4': 'Save to disk',
  'tool.compressImage.name': 'Compress Image',
  'tool.compressImage.desc': 'Resize and convert images with quality control',
  'tool.compressImage.step1': 'Open an image file',
  'tool.compressImage.step2': 'Set image options',
  'tool.compressImage.step3': 'Review output',
  'tool.mergePdf.name': 'Merge PDFs',
  'tool.mergePdf.desc': 'Combine multiple PDFs into one document',
  'step.pickFiles': 'Pick Files',
  'tool.mergePdf.step1': 'Select PDFs to merge',
  'step.order': 'Order',
  'tool.mergePdf.step2': 'Arrange page order',
  'tool.splitPdf.name': 'Split PDF',
  'tool.splitPdf.desc': 'Extract or separate pages from a PDF',
  'tool.splitPdf.step1': 'Open a PDF file',
  'step.selectPages': 'Select Pages',
  'tool.splitPdf.step2': 'Choose pages to extract',
  'tool.rotatePdf.name': 'Rotate PDF',
  'tool.rotatePdf.desc': 'Rotate individual or all pages in a PDF',
  'tool.rotatePdf.step1': 'Open a PDF file',
  'step.selectRotate': 'Select & Rotate',
  'tool.rotatePdf.step2': 'Choose pages and rotation',
  'tool.pdfToJpg.name': 'PDF to JPG',
  'tool.pdfToJpg.desc': 'Export PDF pages as JPEG or PNG images',
  'tool.pdfToJpg.step1': 'Open a PDF file',
  'tool.pdfToJpg.step2': 'Set format and quality',
  'tool.jpgToPdf.name': 'JPG to PDF',
  'tool.jpgToPdf.desc': 'Convert images into a single PDF document',
  'step.pickImages': 'Pick Images',
  'tool.jpgToPdf.step1': 'Select images to convert',
  'tool.jpgToPdf.step2': 'Set page size and layout',
  'tool.protectPdf.name': 'Protect PDF',
  'tool.protectPdf.desc': 'Add password encryption to a PDF',
  'tool.protectPdf.step1': 'Open a PDF file',
  'step.password': 'Password',
  'tool.protectPdf.step2': 'Set a password',
  'tool.unlockPdf.name': 'Unlock PDF',
  'tool.unlockPdf.desc': 'Remove password protection from a PDF',
  'tool.unlockPdf.step1': 'Open a PDF file',
  'tool.unlockPdf.step2': 'Enter the password',
  'tool.rotateImage.name': 'Rotate Image',
  'tool.rotateImage.desc': 'Rotate images 90°, 180°, or 270°',
  'tool.rotateImage.step1': 'Open an image file',
  'step.rotate': 'Rotate',
  'tool.rotateImage.step2': 'Choose rotation angle',
  'tool.convertImage.name': 'Convert Image',
  'tool.convertImage.desc': 'Convert between JPG, PNG, and WebP formats',
  'tool.convertImage.step1': 'Open an image file',
  'tool.convertImage.step2': 'Choose output format',
  'tool.pageNumbers.name': 'Page Numbers',
  'tool.pageNumbers.desc': 'Add page numbers to PDF pages',
  'tool.pageNumbers.step1': 'Open a PDF file',
  'tool.pageNumbers.step2': 'Set numbering options',
  'tool.watermark.name': 'Watermark',
  'tool.watermark.desc': 'Add text or image watermark to PDF pages',
  'tool.watermark.step1': 'Save numbered PDF',
  'tool.watermark.step2': 'Open a PDF file',
  'tool.cropPdf.name': 'Crop PDF',
  'tool.cropPdf.desc': 'Crop margins or select a region on pages',
  'tool.cropPdf.step1': 'Save watermarked PDF',
  'tool.cropPdf.step2': 'Open a PDF file',
  'tool.organizePdf.name': 'Organize PDF',
  'tool.organizePdf.desc': 'Reorder, delete, or duplicate pages',
  'tool.organizePdf.step1': 'Save cropped PDF',
  'tool.organizePdf.step2': 'Open a PDF file',
  'tool.signPdf.name': 'Sign PDF',
  'tool.signPdf.desc': 'Add a visual signature stamp to PDF pages',
  'tool.signPdf.step1': 'Save organized PDF',
  'step.selectPdf': 'Select PDF',
  'tool.signPdf.step2': 'Open a PDF file',
  'step.signature': 'Signature',
  'tool.signPdf.step3': 'Create or choose a signature',
  'tool.redactPdf.name': 'Redact PDF',
  'tool.redactPdf.desc': 'Permanently remove text or areas from a PDF',
  'tool.redactPdf.step1': 'Save signed PDF',
  'tool.redactPdf.step2': 'Open a PDF file',
  'tool.pdfaConvert.name': 'PDF/A Convert',
  'tool.pdfaConvert.desc': 'Convert PDF to archival PDF/A format',
  'tool.pdfaConvert.step1': 'Save redacted PDF',
  'tool.pdfaConvert.step2': 'Open a PDF file',
  'tool.repairPdf.name': 'Repair PDF',
  'tool.repairPdf.desc': 'Fix corrupted or malformed PDFs',
  'tool.repairPdf.step1': 'Save PDF/A file',
  'tool.repairPdf.step2': 'Open a PDF file',
  'tool.editPdf.name': 'Edit PDF',
  'tool.editPdf.desc': 'Edit text and images in a PDF document',
  'step.repair': 'Repair',
  'tool.editPdf.step1': 'Fix PDF issues',
  'tool.editPdf.step2': 'Save repaired PDF',
  'tool.editPdf.step3': 'Open a PDF file',
  'tool.convertDoc.name': 'Convert Document',
  'tool.convertDoc.desc': 'Convert between PDF, DOC, EPUB, and ebook formats',
  'step.edit': 'Edit',
  'tool.convertDoc.step1': 'Edit text and images',
  'tool.convertDoc.step2': 'Save edited PDF',
  'tool.convertDoc.step3': 'Open a document file',
  'tool.convertDoc.step4': 'Set conversion options',
  'tool.convertDoc.step5': 'Review output',
  'tool.convertDoc.step6': 'Save converted document',
  'stepBar.lockedHint': '{step} — complete previous steps first',
  'tool.compressImage.step4': 'Save to disk',
  'tool.mergePdf.step3': 'Save merged PDF',
  'tool.splitPdf.step3': 'Save extracted pages',
  'tool.rotatePdf.step3': 'Save rotated PDF',
  'tool.pdfToJpg.step3': 'Save images',
  'tool.jpgToPdf.step3': 'Save PDF',
  'tool.protectPdf.step3': 'Save protected PDF',
  'tool.unlockPdf.step3': 'Save unlocked PDF',
  'tool.rotateImage.step3': 'Save rotated image',
  'tool.convertImage.step3': 'Save converted image',
  'step.crop': 'Crop',
  'step.organize': 'Organize',
  'step.place': 'Place',
  'step.redact': 'Redact',

  // ── Messages and toasts ─────────────────────────────────────────────────
  'app.thisFileIsEmptyPlease': 'This file is empty. Please try a different file.',
  'app.pleaseTryAgain': 'Please try again.',
  'crashReporter.previewWhatWillBeSent': 'Preview what will be sent',
  'crashReporter.hideReportPreview': 'Hide report preview',
  'crashReporter.hideErrorDetails': 'Hide error details',
  'crashReporter.showErrorDetails': 'Show error details',
  'imageCompareStep.copyStats': 'Copy stats',
  'imageCompareStep.copied': 'Copied',
  'dashboard.clickAnotherCardToSwap': 'Click another card to swap',
  'dashboard.addToFavorites': 'Add to favorites',
  'dashboard.clickToReorder': 'Click to reorder',
  'saveStep.youCanTryAgainAny': 'You can try again any time.',
  'saveStep.chooseASaveLocation': 'Choose a save location…',
  'saveStep.saveCancelled': 'Save cancelled',
  'saveStep.saving': 'Saving…',
  'imageConfigureStep.widthAndHeightMustBe': 'Width and height must be positive numbers',
  'imageConfigureStep.aspectRatioUnlocked': 'Aspect ratio unlocked',
  'imageConfigureStep.aspectRatioLocked': 'Aspect ratio locked',
  'imageConfigureStep.unlockAspectRatio': 'Unlock aspect ratio',
  'imageConfigureStep.lockAspectRatio': 'Lock aspect ratio',
  'imageConfigureStep.generatePreview': 'Generate Preview',
  'imageConfigureStep.compression': 'Compression',
  'themeToggle.system': 'System',
  'themeToggle.light': 'Light',
  'configureStep.compressionNotAvailable': 'Compression not available',
  'configureStep.enterAValidTargetSize': 'Enter a valid target size',
  'pdfToJpgFlow.libreoffice': 'LibreOffice',
  'pdfToJpgFlow.calibre': 'Calibre',
  'exportPanel.fixed': 'Fixed',
  'mergePickStep.selectPdfs': 'Select PDFs',
  'mergePickStep.addMore': 'Add More',
  'unlockPdfFlow.incorrectPasswordOrThePdf': 'Incorrect password or the PDF is not password-protected.',
  'pdfaConvertFlow.modernStandardSupportsTransparency': 'Modern standard, supports transparency',
  'pdfaConvertFlow.latestSupportsAttachments': 'Latest, supports attachments',
  'pdfaConvertFlow.basicCompatibility': 'Basic compatibility',
  'jpgToPdfFlow.selectImages': 'Select Images',
  'signatureCreateStep.saveUse': 'Save & Use',
  'signatureUpload.chooseImage': 'Choose Image...',
  'watermarkFlow.enterWatermarkTextToSee': 'Enter watermark text to see preview',
  'toolSidebar.closePanel': 'Close panel',
  'toolSidebar.openPanel': 'Open panel',
  'editorView.tryToRepair': 'Try to repair',
  'editorView.repairing': 'Repairing…',
  'toolSidebarPanel.couldNotDrawTheSignature': 'Could not draw the signature. Try a different style or a shorter name.',
  'toolSidebarPanel.alreadyMarked': 'Already marked',
  'toolSidebarPanel.markThisOne': 'Mark this one',
  'toolSidebarPanel.redacting': 'Redacting…',
  'toolSidebarPanel.apply': 'Apply',

  // ── File dialog filters (shown by the OS picker) ────────────────────────
  'filter.jpegImage': 'JPEG Image',
  'filter.pngImage': 'PNG Image',
  'filter.webpImage': 'WebP Image',
  'filter.pdfFiles': 'PDF Files',
  'filter.zipArchive': 'ZIP Archive',
  'filter.pdfDocument': 'PDF Document',
  'filter.supportedFiles': 'Supported Files',
  'filter.documentsImages': 'Documents & Images',
  'filter.imageFiles': 'Image Files',
  'filter.images': 'Images',
  'filter.documentFiles': 'Document Files',

  // ── Errors, labels and option lists ─────────────────────────────────────
  'editorContext.theSelectedPdfHasNo': 'The selected PDF has no pages.',
  'crashReporter.unknownError': 'Unknown error',
  'dashboard.documentTools': 'Document Tools',
  'dashboard.imageTools': 'Image Tools',
  'saveStep.couldNotWriteFileCheck': 'Could not write file. Check that you have permission to write to the selected location.',
  'saveStep.couldNotOpenFolderPicker': 'Could not open folder picker.',
  'saveStep.couldNotOpenSaveDialog': 'Could not open save dialog.',
  'saveStep.couldNotWriteFiles': 'Could not write files.',
  'saveStep.couldNotCreateZip': 'Could not create ZIP.',
  'saveStep.couldNotWriteFile': 'Could not write file.',
  'saveStep.creatingZip': 'Creating ZIP…',
  'landingCard.anywhereOnTheWindow': 'Anywhere on the window',
  'landingCard.unsupportedFile': 'Unsupported file',
  'landingCard.dropFileHere': 'Drop file here',
  'landingCard.dropToOpen': 'Drop to open',
  'compareStep.thisFileIsAlreadyAt': 'This file is already at maximum compression for all quality settings.',
  'compareStep.tryALowerQualityLevel': 'Try a lower quality level to reduce further.',
  'compareStep.fileAlreadyOptimal': 'File already optimal',
  'configureStep.noRecompression': 'No recompression',
  'configureStep.smallestFile': 'Smallest file',
  'configureStep.highQuality': 'High quality',
  'repairPdfFlow.couldNotOpenFilePicker': 'Could not open file picker.',
  'splitSelectStep.everyNPages': 'Every N Pages',
  'splitSelectStep.extractAll': 'Extract All',
  'splitSelectStep.byRange': 'By Range',
  'pdfToJpgFlow.extractingSelectedPages': 'Extracting selected pages...',
  'pdfToJpgFlow.conversionFailed': 'Conversion failed.',
  'editorLayout.imageExtractionFailedForPage': 'Image extraction failed for page',
  'editorLayout.textExtractionFailedForPage': 'Text extraction failed for page',
  'pageCanvas.failedToRenderPage': 'Failed to render page',
  'editorToolbar.courierNewMonospace': 'Courier New (Monospace)',
  'editorToolbar.timesNewRomanSerif': 'Times New Roman (Serif)',
  'exportPanel.selectFormat': 'Select format',
  'mergeOrderStep.mergeFailed': 'Merge failed.',
  'unlockPdfFlow.wrongPassword': 'Wrong password',
  'convertImageFlow.failedToLoadImage': 'Failed to load image.',
  'organizePdfFlow.failedToOrganizePdf': 'Failed to organize PDF.',
  'jpgToPdfFlow.failedToCreatePdf': 'Failed to create PDF.',
  'jpgToPdfFlow.medium20mm': 'Medium (20mm)',
  'jpgToPdfFlow.small10mm': 'Small (10mm)',
  'jpgToPdfFlow.createPdf': 'Create PDF',
  'redactPdfFlow.redactionFailed': 'Redaction failed.',
  'signaturePlaceStep.applySignature': 'Apply Signature',
  'rotateImageFlow.rotationFailed': 'Rotation failed.',
  'watermarkFlow.failedToApplyWatermark': 'Failed to apply watermark.',
  'watermarkFlow.applyWatermark': 'Apply Watermark',
  'pageNumbersFlow.failedToAddPageNumbers': 'Failed to add page numbers.',
  'pageNumbersConfigureStep.applyPageNumbers': 'Apply Page Numbers',
  'cropPdfFlow.cropFailed': 'Crop failed.',
  'cropPdfFlow.applyCrop': 'Apply Crop',
  'convertDocFlow.word972003Document': 'Word 97-2003 Document',
  'convertDocFlow.richTextFormat': 'Rich Text Format',
  'convertDocFlow.wordDocument': 'Word Document',
  'convertDocFlow.plainText': 'Plain Text',
  'unsavedChangesDialog.thisDocument': 'This document',
  'zoomToolbar.fitWidth': 'Fit Width',
  'editorView.unsavedChanges': 'Unsaved Changes',
  'toolSidebarPanel.smallestFileBestForScreen': 'Smallest file — best for screen viewing',
  'toolSidebarPanel.goodForReadingOnDevices': 'Good for reading on devices',
  'toolSidebarPanel.suitableForPrinting': 'Suitable for printing',
  'toolSidebarPanel.noPreviewAvailable': 'No preview available',
  'toolSidebarPanel.maximumPrepress': 'Maximum (Prepress)',
  'toolSidebarPanel.mediumEbook': 'Medium (eBook)',
  'toolSidebarPanel.highPrint': 'High (Print)',
  'toolSidebarPanel.upsideDown': 'Upside Down',
  'toolSidebarPanel.turnRight': 'Turn Right',
  'toolSidebarPanel.turnLeft': 'Turn Left',
  'docModel.thisDocumentHasNoExtractable': 'This document has no extractable text — it looks scanned or image-only.',
  'pdfUtils.thisFileAppearsToBe': 'This file appears to be corrupted or is not a valid PDF. Please try a different file.',
  'pdfUtils.failedToLoadPdfThe': 'Failed to load PDF. The file may be corrupted or not a valid PDF document.',
  'pdfUtils.thisFileIsNotA': 'This file is not a valid PDF document. Please select a valid PDF file.',
  'pdfUtils.thisPdfIsPasswordProtected': 'This PDF is password-protected and could not be opened.',
  'redactionScope.coversTheWholeLineIt': 'Covers the whole line it sits on',
  'redactionScope.coversOnlyTheFoundText': 'Covers only the found text',
  'redactionScope.justTheMatch': 'Just the match',
  'redactionScope.wholeLine': 'Whole line',
  'pdfProcessor.thisFileIsMostlyText': 'This file is mostly text with no embedded images — compression has minimal effect on text-only PDFs.',
  'pdfProcessor.customPageSizeRequiresBoth': 'Custom page size requires both width and height in mm',
  'pdfMerge.atLeast2PdfsAre': 'At least 2 PDFs are required to merge.',
  'documentConverter.noConversionToolsDetected': 'No conversion tools detected.',

  // ── Option labels and error fallbacks ───────────────────────────────────
  'imageConfigureStep.web': 'Web',
  'imageConfigureStep.square': 'Square',
  'imageConfigureStep.thumb': 'Thumb',
  'configureStep.screen': 'Screen',
  'configureStep.print': 'Print',
  'configureStep.archive': 'Archive',
  'configureStep.a4210297Mm': 'A4 (210 × 297 mm)',
  'configureStep.a3297420Mm': 'A3 (297 × 420 mm)',
  'configureStep.letter216279Mm': 'Letter (216 × 279 mm)',
  'configureStep.custom': 'Custom…',
  'pdfToJpgFlow.word': 'Word',
  'pdfToJpgFlow.kindle': 'Kindle',
  'editorToolbar.helveticaArialSansSerif': 'Helvetica / Arial (Sans-serif)',
  'signatureTyped.flowing': 'Flowing',
  'signatureTyped.casual': 'Casual',
  'signatureTyped.formal': 'Formal',
  'signatureTyped.mono': 'Mono',
  'signatureCreateStep.draw': 'Draw',
  'signatureCreateStep.type': 'Type',
  'signatureCreateStep.upload': 'Upload',
  'watermarkFlow.small': 'Small',
  'watermarkFlow.medium': 'Medium',
  'watermarkFlow.large': 'Large',
  'pageNumbersConfigureStep.iIiIii': 'i, ii, iii',
  'cropPdfFlow.none': 'None',
  'convertConfigStep.top': 'Top',
  'convertConfigStep.bottom': 'Bottom',
  'toolSidebarPanel.webScreen': 'Web / Screen',
  'toolSidebarPanel.script': 'Script',
  'toolSidebarPanel.clean': 'Clean',
  'colorPresets.black': 'Black',
  'colorPresets.white': 'White',
  'colorPresets.charcoal': 'Charcoal',
  'colorPresets.grey': 'Grey',
  'colorPresets.red': 'Red',
  'colorPresets.orange': 'Orange',
  'colorPresets.green': 'Green',
  'colorPresets.blue': 'Blue',
  'colorPresets.navy': 'Navy',
  'colorPresets.purple': 'Purple',
  'colorPresets.pink': 'Pink',
  'save.saveNFiles': 'Save {files}',
  'save.renamedToAvoidOverwrite': 'Renamed to avoid overwriting: {names}',

  // ── Batch processing ────────────────────────────────────────────────────
  'batch.stoppedEarly': 'This run was stopped before every file was processed.',
  'batch.filesReady': '{files} ready to save',
  'batch.totalSaving': 'Saved {saved} in total — {output} to write.',
  'batch.couldNotBeProcessed': '{files} could not be processed',
  'batch.processingFile': 'Processing {current} of {total} — {name}',
  'batch.skippedDifferentType': 'Skipped {count} file(s) of a different type — a batch has to be one type.',

  // ── Dependency hints ────────────────────────────────────────────────────
  'deps.ghostscriptMac': 'Compressing PDFs needs Ghostscript. Install it with: brew install ghostscript',
  'deps.ghostscriptWindows': 'Compressing PDFs needs Ghostscript. Download it from ghostscript.com/releases/gsdnld.html and make sure it is on your PATH.',
  'deps.ghostscriptLinux': 'Compressing PDFs needs Ghostscript. Install it with your package manager, e.g. sudo apt install ghostscript',
  'deps.calibre': 'Install Calibre for ebook support — calibre-ebook.com/download',
  'deps.libreoffice': 'Install LibreOffice for document conversion — libreoffice.org/download',

  // ── OCR ─────────────────────────────────────────────────────────────────
  'tool.ocrPdf.name': 'Make Searchable',
  'tool.ocrPdf.desc': 'Read the text on a scan so it can be searched and copied',
  'tool.ocrPdf.step1': 'Choose a scanned PDF',
  'tool.ocrPdf.step2': 'Read the text on each page',
  'tool.ocrPdf.step3': 'Save the searchable PDF',
  'step.recognise': 'Recognise',
  'ocr.title': 'Make a scan searchable',
  'ocr.intro': 'Reads the text in a scanned PDF and adds an invisible text layer, so it can be searched and copied. The page looks exactly the same.',
  'ocr.selectPdf': 'Select PDF',
  'ocr.language': 'Language of the document',
  'ocr.start': 'Read the text',
  'ocr.readingPage': 'Reading page {current} of {total}…',
  'ocr.foundWords': 'Found {words} across {pages}.',
  'ocr.nothingFound': 'No readable text was found on this document.',
  'ocr.nothingFoundHint': 'It may be blank, or the scan may be too dark or blurred to read. A sharper, brighter scan usually helps.',
  'ocr.lowConfidence': 'The text was hard to read on this scan.',
  'ocr.lowConfidenceHint': 'It has been added, but expect mistakes. A sharper, straighter, better-lit scan gives a much better result.',
  'ocr.alreadySearchable': 'This PDF already has a text layer.',
  'ocr.alreadySearchableHint': 'You can still run this, but it is usually unnecessary — the text can already be searched.',
  'ocr.saveSearchable': 'Save searchable PDF',
  'ocr.needsMacos': 'Text recognition is only available on macOS for now.',
  'count.word_one': '{count} word',
  'count.word_other': '{count} words',
  'ocrLang.english': 'English',
  'ocrLang.german': 'German',
  'ocrLang.turkish': 'Turkish',
  'ocrLang.french': 'French',
  'ocrLang.spanish': 'Spanish',
  'ocrLang.italian': 'Italian',
  'ocrLang.dutch': 'Dutch',
  'ocrLang.polish': 'Polish',

  // ── Redaction search on a scan ──────────────────────────────────────────
  'redactPdf.noMatches': 'No matches for “{query}”. A scanned page has no selectable text, so it cannot be searched until it has been read.',
  'redactPdf.noMatchesInScan': 'No matches for “{query}” in the text read from this scan.',
  'redactPdf.readScanAndSearch': 'Read the text and search again',
  'redactPdf.readingScan': 'Reading the scan…',
  'redactPdf.scanBoxesApproximate': 'These boxes come from text read off a scan, so they are approximate. Check the placement before applying — redaction cannot be undone.',
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
