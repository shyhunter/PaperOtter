/**
 * ExportPanel: compact Convert/Export panel for the PDF editor right panel.
 * Reuses documentConverter.ts — does NOT duplicate conversion logic.
 * Allows users to export the current (possibly edited) PDF to other formats
 * without leaving the editor.
 */

import { useState, useEffect, useCallback } from 'react';
import { Loader2, AlertTriangle, Download } from 'lucide-react';
import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  getAvailableOutputFormats,
  checkSidecarAvailability,
  getEngineForFormat,
  convertDocument,
} from '@/lib/documentConverter';
import { applyAllEdits } from '@/lib/pdfEditor';
import type { ConvertFormat, ConvertOptions, EpubLayout } from '@/types/converter';
import type { PageEditState } from '@/types/editor';

const FORMAT_LABELS: Record<ConvertFormat, string> = {
  pdf: 'PDF',
  docx: 'DOCX',
  doc: 'DOC',
  odt: 'ODT',
  epub: 'EPUB',
  mobi: 'MOBI',
  azw3: 'AZW3',
  txt: 'TXT',
  rtf: 'RTF',
};

const FONT_FAMILIES = [
  'Arial',
  'Times New Roman',
  'Courier New',
  'Georgia',
  'Verdana',
];

const LINE_SPACING_OPTIONS = [
  { label: '1.0', value: 1.0 },
  { label: '1.15', value: 1.15 },
  { label: '1.5', value: 1.5 },
  { label: '2.0', value: 2.0 },
];

interface ExportPanelProps {
  /** Current PDF bytes (may be unedited) */
  pdfBytes: Uint8Array;
  /** Original file path */
  filePath: string;
  /** Pending page edits to apply before export */
  pageEdits: PageEditState[];
  /** Whether the editor has unsaved changes */
  isDirty: boolean;
  /** Optional callback on export complete */
  onExportComplete?: () => void;
}

export function ExportPanel({
  pdfBytes,
  filePath,
  pageEdits,
  isDirty,
  onExportComplete,
}: ExportPanelProps) {
  const availableFormats = getAvailableOutputFormats('pdf');
  const [selectedFormat, setSelectedFormat] = useState<ConvertFormat | null>(null);
  const [sidecarStatus, setSidecarStatus] = useState<{ libreoffice: boolean; calibre: boolean } | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Typography controls (collapsed by default)
  const [showTypography, setShowTypography] = useState(false);
  const [fontFamily, setFontFamily] = useState('Arial');
  const [fontSize, setFontSize] = useState(12);
  const [margin, setMargin] = useState(25);
  const [lineSpacing, setLineSpacing] = useState(1.15);
  const [epubLayout, setEpubLayout] = useState<EpubLayout>('reflowable');

  // Check sidecar availability on mount
  useEffect(() => {
    checkSidecarAvailability().then(setSidecarStatus);
  }, []);

  const neededEngine = selectedFormat ? getEngineForFormat(selectedFormat) : null;
  const engineAvailable = !neededEngine || !sidecarStatus
    ? true
    : neededEngine === 'libreoffice' ? sidecarStatus.libreoffice : sidecarStatus.calibre;

  const handleExport = useCallback(async () => {
    if (!selectedFormat) return;
    setIsConverting(true);
    setError(null);
    setSuccess(null);

    try {
      // Apply pending edits first if dirty
      let exportBytes = pdfBytes;
      if (isDirty) {
        exportBytes = new Uint8Array(await applyAllEdits(pdfBytes, pageEdits));
      }

      // Write to temp file for conversion
      const tempPath = filePath.replace(/\.pdf$/i, '_export_temp.pdf');
      await writeFile(tempPath, exportBytes);

      const options: ConvertOptions = {
        outputFormat: selectedFormat,
        fontFamily,
        fontSize,
        marginTop: margin,
        marginRight: margin,
        marginBottom: margin,
        marginLeft: margin,
        lineSpacing,
        epubLayout: selectedFormat === 'epub' ? epubLayout : undefined,
      };

      const result = await convertDocument(tempPath, 'pdf', options);

      // Save dialog
      const ext = selectedFormat;
      const defaultName = filePath
        .replace(/^.*[\\/]/, '')
        .replace(/\.pdf$/i, `.${ext}`);

      const savePath = await save({
        defaultPath: defaultName,
        filters: [{ name: FORMAT_LABELS[selectedFormat], extensions: [ext] }],
      });

      if (savePath) {
        await writeFile(savePath, result.outputBytes);
        const sizeMb = (result.outputSize / 1024 / 1024).toFixed(1);
        setSuccess(`Saved as ${FORMAT_LABELS[selectedFormat]} (${sizeMb} MB)`);
        onExportComplete?.();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setIsConverting(false);
    }
  }, [
    selectedFormat, pdfBytes, isDirty, pageEdits, filePath,
    fontFamily, fontSize, margin, lineSpacing, epubLayout, onExportComplete,
  ]);

  return (
    <div className="flex flex-col gap-3 p-4">
      <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        Export / Convert
      </h4>

      {/* Format selector grid */}
      <div className="grid grid-cols-3 gap-1.5">
        {availableFormats.map((fmt) => (
          <button
            key={fmt}
            onClick={() => {
              setSelectedFormat(fmt);
              setSuccess(null);
              setError(null);
            }}
            className={cn(
              'px-2 py-1.5 rounded-md text-xs font-medium border transition-colors',
              selectedFormat === fmt
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background border-border hover:bg-muted',
            )}
          >
            {FORMAT_LABELS[fmt]}
          </button>
        ))}
      </div>

      {/* EPUB layout toggle */}
      {selectedFormat === 'epub' && (
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">
            EPUB Layout
          </label>
          <div className="flex gap-1">
            {(['reflowable', 'fixed'] as const).map((layout) => (
              <Button
                key={layout}
                variant={epubLayout === layout ? 'default' : 'outline'}
                size="sm"
                className="flex-1 text-xs"
                onClick={() => setEpubLayout(layout)}
              >
                {layout === 'reflowable' ? 'Reflowable' : 'Fixed'}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Typography controls (collapsible) */}
      <button
        onClick={() => setShowTypography(!showTypography)}
        className="text-xs text-muted-foreground hover:text-foreground text-left transition-colors"
      >
        {showTypography ? '▾' : '▸'} Typography options
      </button>

      {showTypography && (
        <div className="flex flex-col gap-2 pl-2 border-l-2 border-border">
          {/* Font family */}
          <div>
            <label className="text-[10px] text-muted-foreground mb-0.5 block">Font</label>
            <select
              value={fontFamily}
              onChange={(e) => setFontFamily(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
            >
              {FONT_FAMILIES.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>

          {/* Font size */}
          <div>
            <label className="text-[10px] text-muted-foreground mb-0.5 block">Size (pt)</label>
            <input
              type="number"
              min={8}
              max={72}
              value={fontSize}
              onChange={(e) => setFontSize(Number(e.target.value))}
              className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
            />
          </div>

          {/* Margins */}
          <div>
            <label className="text-[10px] text-muted-foreground mb-0.5 block">Margins (mm)</label>
            <input
              type="number"
              min={0}
              max={100}
              value={margin}
              onChange={(e) => setMargin(Number(e.target.value))}
              className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
            />
          </div>

          {/* Line spacing */}
          <div>
            <label className="text-[10px] text-muted-foreground mb-0.5 block">Line spacing</label>
            <select
              value={lineSpacing}
              onChange={(e) => setLineSpacing(Number(e.target.value))}
              className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
            >
              {LINE_SPACING_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Sidecar availability warning */}
      {selectedFormat && !engineAvailable && (
        <div className="flex items-start gap-2 text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 rounded-md p-2">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>
            {neededEngine === 'libreoffice'
              ? 'LibreOffice is required. Install from libreoffice.org'
              : 'Calibre is required. Install from calibre-ebook.com'}
          </span>
        </div>
      )}

      {/* Export button */}
      <Button
        size="sm"
        className="w-full"
        disabled={!selectedFormat || !engineAvailable || isConverting}
        onClick={handleExport}
      >
        {isConverting ? (
          <>
            <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
            Converting...
          </>
        ) : (
          <>
            <Download className="w-3.5 h-3.5 mr-2" />
            {selectedFormat
              ? `Export as ${FORMAT_LABELS[selectedFormat]}`
              : 'Select format'}
          </>
        )}
      </Button>

      {isDirty && selectedFormat && (
        <p className="text-[10px] text-muted-foreground">
          Pending edits will be applied before export.
        </p>
      )}

      {/* Status messages */}
      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}
      {success && (
        <p className="text-xs text-green-600 dark:text-green-400">{success}</p>
      )}
    </div>
  );
}
