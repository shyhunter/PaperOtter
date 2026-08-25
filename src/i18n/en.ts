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
