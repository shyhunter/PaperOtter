/**
 * The redaction assembly, on a thread of its own.
 *
 * Only the pdf-lib half runs here. Rendering stays on the main thread because it
 * needs a canvas, and moving that too would mean depending on `OffscreenCanvas`
 * — supported everywhere PaperOtter ships *today*, but a platform requirement we
 * would be taking on for a second or so, on the largest pages only. pdf-lib is
 * plain JavaScript with no DOM in sight, so this half moves for free.
 *
 * That half is the expensive one: `embedPng` parsing a large PNG and `save`
 * serialising it were a single 2.5-second task with the window painting nothing
 * and the OS offering to close it. Neither can be broken up, because both are
 * one synchronous call inside a library — so the only way to stop them blocking
 * the window is to run them somewhere the window is not.
 */
import { assembleRedacted, type PagePlan } from '@/lib/pdfRedact';

interface Request {
  sourceBytes: Uint8Array;
  plan: PagePlan[];
}

/**
 * The worker's own global, typed to what this file uses.
 *
 * `self` is declared as a Window by the DOM lib, which has a different
 * `postMessage` and would reject the transfer list. Narrowing it here keeps the
 * project's `lib` setting alone for the one file that needs a worker scope.
 */
const ctx = self as unknown as {
  onmessage: ((event: MessageEvent<Request>) => void) | null;
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
};

ctx.onmessage = async (event: MessageEvent<Request>) => {
  try {
    const { sourceBytes, plan } = event.data;
    const bytes = await assembleRedacted(sourceBytes, plan);
    // Transferred, not copied: the output of a photographic page runs to tens of
    // megabytes and copying it back would hand some of the cost straight back.
    const buffer = bytes.buffer as ArrayBuffer;
    ctx.postMessage({ ok: true, bytes: buffer }, [buffer]);
  } catch (error) {
    // Reported rather than thrown, so the caller rejects with something it can
    // show instead of a bare "worker error" with no cause attached.
    ctx.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
