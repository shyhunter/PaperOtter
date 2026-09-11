// The one way a file enters a tool.
//
// There were two. Compress PDF and Compress Image used LandingCard -- Open file
// beside Drop file here -- behind nine guards: format, HEIC decodability, size,
// emptiness, PDF magic bytes, and the difference between a damaged file and one
// we simply are not allowed to read. The other seventeen tools each hand-rolled
// a Select PDF button with none of that, and none of them listened for a drop
// at all: `useFileDrop` was called in exactly one place in the app. Dropping a
// file on the dashboard worked; opening Redact PDF first and then dropping the
// same file did nothing, silently.
//
// This is that logic, extracted whole, so every tool gets the same picker, the
// same drop target and the same refusals.
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { LandingCard } from '@/components/LandingCard';
import { useFileDrop } from '@/hooks/useFileDrop';
import { openFilePicker } from '@/hooks/useFileOpen';
import { useRecentDirs } from '@/hooks/useRecentDirs';
import { useToolContext } from '@/context/ToolContext';
import {
  detectFormat, getFileName, isPdfHeader, FILE_SIZE_LIMIT_BYTES,
  isHeicPath, isHeicDecodable, heicUnsupportedMessage,
} from '@/lib/fileValidation';
import { friendlyPdfError, isPermissionError } from '@/lib/pdfUtils';
import type { SupportedFormat } from '@/types/file';
import { t } from '@/i18n';

interface FilePickStepProps {
  /** The tool's own `acceptsFormats`. Drives the dialog filter, the hint under
   *  the button, and whether a hovering file shows the accept or refuse colour. */
  acceptedFormats: readonly SupportedFormat[];
  /** Called once the file has passed every guard. `alsoSelected` carries the
   *  rest of a multi-file pick or drop, already filtered to the same format. */
  onFileReady: (filePath: string, alsoSelected: string[]) => void;
  /** Let the dialog take several files at once (Merge, JPG to PDF). */
  multiple?: boolean;
  /** The flow's own failure -- a locked PDF, a parse error -- shown in the
   *  card's error slot rather than in a second place of the flow's own. */
  error?: string | null;
  /** The flow is reading the file it was handed. */
  isLoading?: boolean;
  /** The tool's own one-line description, above the card. */
  tagline?: string;
}

export function FilePickStep({
  acceptedFormats,
  onFileReady,
  multiple = false,
  error = null,
  isLoading = false,
  tagline,
}: FilePickStepProps) {
  const { selectTool, pendingFiles, setPendingFiles } = useToolContext();
  const { addDir: addRecentDir } = useRecentDirs();

  const [invalidDropError, setInvalidDropError] = useState<string | null>(null);
  const [emptyFileError, setEmptyFileError] = useState<string | null>(null);
  const [corruptFileError, setCorruptFileError] = useState<string | null>(null);
  const [fileSizeLimitBytes, setFileSizeLimitBytes] = useState<number | null>(null);
  const [corruptPdfBlock, setCorruptPdfBlock] = useState<{ name: string } | null>(null);

  // On from the moment a file is handed over, not from when the flow starts
  // reading it. The guards below have to read the file themselves, and on a
  // large document that takes seconds -- during which nothing on screen moved,
  // so a 77 MB PDF looked like a dead click for ten seconds before the loader
  // finally appeared.
  const [checking, setChecking] = useState(false);

  const handleFileSelected = useCallback(
    async (filePath: string, alsoSelected: string[] = []) => {
      // A failure message stays until the user tries again. It used to clear on
      // a timer, which meant a long message was gone before it could be read.
      setCorruptFileError(null);
      setChecking(true);
      try {

      if (!filePath) {
        setInvalidDropError(t('file.unsupported'));
        setTimeout(() => setInvalidDropError(null), 2500);
        return;
      }

      const format = detectFormat(filePath);
      if (!format) {
        setInvalidDropError(t('file.unsupported'));
        setTimeout(() => setInvalidDropError(null), 2500);
        return;
      }

      // The dialog filters by tool, but a filter is only a hint: drag-and-drop
      // and the recent-folders dialog can still hand this the other kind, and
      // accepting it would start the sibling tool's job under this tool's name.
      if (!acceptedFormats.includes(format)) {
        setInvalidDropError(
          acceptedFormats.includes('image')
            ? t('file.needsImage', { tool: t('tool.compressPdf.name') })
            : t('file.needsPdf', { tool: t('tool.compressImage.name') }),
        );
        setTimeout(() => setInvalidDropError(null), 3500);
        return;
      }

      // HEIC decoding needs macOS Image I/O. Say so here rather than letting the
      // user configure a whole job and fail at the last step.
      if (isHeicPath(filePath) && !isHeicDecodable()) {
        setInvalidDropError(heicUnsupportedMessage());
        setTimeout(() => setInvalidDropError(null), 4000);
        return;
      }

      // One read, two questions.
      //
      // `getFileSizeBytes` reads the whole file to return `.byteLength`, and the
      // magic-byte check then read the whole file again for five bytes -- so a
      // 77 MB PDF was read twice here and a third time by the flow. The size and
      // the header both come out of the same buffer now.
      let bytes: Uint8Array;
      try {
        const { readFile } = await import('@tauri-apps/plugin-fs');
        bytes = await readFile(filePath);
      } catch (err) {
        // A file we are not allowed to read is not a damaged file. Saying
        // "corrupt" sends the user to repair a document that is intact.
        if (isPermissionError(err)) {
          toast.error(friendlyPdfError(err));
        } else {
          setCorruptFileError(t('app.thisFileAppearsToBe'));
        }
        return;
      }

      const sizeBytes = bytes.byteLength;

      if (sizeBytes === 0) {
        setEmptyFileError(t('app.thisFileIsEmptyPlease'));
        setTimeout(() => setEmptyFileError(null), 2500);
        return;
      }

      if (sizeBytes > FILE_SIZE_LIMIT_BYTES) {
        setFileSizeLimitBytes(sizeBytes);
        return;
      }

      // Checked here so a damaged PDF says so now, rather than arriving as a
      // parse error three steps later.
      if (format === 'pdf' && !isPdfHeader(bytes.slice(0, 5))) {
        setCorruptPdfBlock({ name: getFileName(filePath) });
        return;
      }

      // Only files of the same type join a batch: the options chosen later are
      // type-specific, so a PDF and a JPEG cannot share a run.
      const sameType = alsoSelected.filter((p) => detectFormat(p) === format);
      const skipped = alsoSelected.length - sameType.length;
      if (skipped > 0) {
        toast(t('batch.skippedDifferentType', { count: skipped }));
      }

      addRecentDir(filePath);
      onFileReady(filePath, sameType);
      } finally {
        // The flow takes over the loader from here; on any refusal above, this
        // is what puts it away again.
        setChecking(false);
      }
    },
    [acceptedFormats, addRecentDir, onFileReady],
  );

  const handlePickerClick = useCallback(async () => {
    try {
      // E2E hook: tests set this to bypass the frozen Tauri IPC.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const e2eFile = (window as any).__E2E_OPEN_FILE__ as string | undefined;
      if (e2eFile) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (window as any).__E2E_OPEN_FILE__;
        handleFileSelected(e2eFile);
        return;
      }
      const picked = await openFilePicker(acceptedFormats, multiple);
      if (!picked) return; // cancelled
      const [first, ...rest] = Array.isArray(picked) ? picked : [picked];
      if (first) handleFileSelected(first, rest);
    } catch {
      toast.error(t('app.couldNotOpenFilePicker'), { description: t('app.pleaseTryAgain') });
    }
  }, [acceptedFormats, handleFileSelected, multiple]);

  // The same list the picker uses, so hovering a file the tool cannot take
  // shows the refusal colour rather than promising a drop that will be refused.
  const acceptsDroppedFile = useCallback(
    (path: string) => {
      const format = detectFormat(path);
      return format !== null && acceptedFormats.includes(format);
    },
    [acceptedFormats],
  );

  const dragState = useFileDrop(handleFileSelected, acceptsDroppedFile);

  // A file dropped on the dashboard arrives here through ToolContext. Running it
  // through the same guards is the point: that path used to skip them, so a
  // damaged PDF dropped on the dashboard failed later and less clearly than the
  // same file opened from inside the tool.
  //
  // The ref, not the effect's deps, is what makes this run once: StrictMode
  // mounts twice, and `acceptedFormats` is usually an inline array, so
  // handleFileSelected's identity changes on every render.
  const consumed = useRef(false);
  useEffect(() => {
    if (pendingFiles.length === 0 || consumed.current) return;
    consumed.current = true;
    const [first, ...rest] = pendingFiles;
    setPendingFiles([]);
    handleFileSelected(first, rest);
  }, [pendingFiles, setPendingFiles, handleFileSelected]);

  return (
    <LandingCard
      dragState={dragState}
      isLoading={isLoading || checking}
      acceptedFormats={acceptedFormats}
      tagline={tagline}
      onPickerClick={handlePickerClick}
      invalidDropError={invalidDropError}
      emptyFileError={emptyFileError}
      corruptFileError={corruptFileError ?? error}
      fileSizeLimitBytes={fileSizeLimitBytes}
      onFileSizeLimitDismiss={() => setFileSizeLimitBytes(null)}
      corruptPdfBlock={corruptPdfBlock}
      onCorruptPdfDismiss={() => setCorruptPdfBlock(null)}
      onCorruptPdfRepair={() => {
        selectTool('repair-pdf');
        setCorruptPdfBlock(null);
      }}
    />
  );
}
