// IMPORTANT: Use Tauri's onDragDropEvent — NOT HTML5 drag events or react-dropzone.
// Tauri's API (dragDropEnabled: true, default) intercepts OS file drops and provides
// the real file path. HTML5 drag events only give File objects without OS paths.
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { useEffect, useRef, useState } from 'react';
import { isSupportedFile } from '@/lib/fileValidation';
import type { DragState } from '@/types/file';

export function useFileDrop(onFileDrop: (path: string) => void) {
  const [dragState, setDragState] = useState<DragState>('idle');
  // Use ref to avoid re-registering the listener on every render
  const onFileDropRef = useRef(onFileDrop);
  useEffect(() => { onFileDropRef.current = onFileDrop; }, [onFileDrop]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    getCurrentWebview()
      .onDragDropEvent((event) => {
        const { type } = event.payload;

        if (type === 'enter') {
          // paths may be available on enter for mid-drag validation.
          // If paths is missing on enter (Tauri edge case), fall back to 'over-invalid'
          // so the user still gets visual feedback — matches the locked decision.
          const paths = (event.payload as { paths?: string[] }).paths ?? [];
          if (paths.length === 0) {
            // paths not yet available — show neutral state; will update on 'over'
            setDragState('over-invalid');
          } else {
            const valid = paths.length === 1 && isSupportedFile(paths[0]);
            setDragState(valid ? 'over-valid' : 'over-invalid');
          }

        } else if (type === 'over') {
          // Update validity as cursor moves (in case paths became available)
          const paths = (event.payload as { paths?: string[] }).paths ?? [];
          if (paths.length > 0) {
            const valid = paths.length === 1 && isSupportedFile(paths[0]);
            setDragState(valid ? 'over-valid' : 'over-invalid');
          }

        } else if (type === 'drop') {
          const paths = (event.payload as { paths?: string[] }).paths ?? [];
          setDragState('idle');
          if (paths.length === 1 && isSupportedFile(paths[0])) {
            onFileDropRef.current(paths[0]);
          } else {
            // Call with empty string to signal invalid drop to parent
            onFileDropRef.current('');
          }

        } else {
          // 'leave' or cancelled
          setDragState('idle');
        }
      })
      .then((fn) => { unlisten = fn; });

    return () => { unlisten?.(); };
  }, []); // Empty deps — listener registered once; callback kept fresh via ref

  return dragState;
}
