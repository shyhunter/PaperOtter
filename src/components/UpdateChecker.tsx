import { useState, useEffect, useCallback } from 'react';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

type UpdateState =
  | { status: 'idle' }
  | { status: 'available'; version: string; body?: string }
  | { status: 'downloading'; progress: number }
  | { status: 'installing' }
  | { status: 'dismissed' };

export function UpdateChecker() {
  const [state, setState] = useState<UpdateState>({ status: 'idle' });

  useEffect(() => {
    let cancelled = false;

    async function checkForUpdate() {
      try {
        const update = await check();
        if (cancelled) return;

        if (update) {
          setState({
            status: 'available',
            version: update.version,
            body: update.body ?? undefined,
          });
        }
      } catch (err) {
        // Silent failure -- update checks should never block the app
        console.warn('[UpdateChecker] Update check failed:', err);
      }
    }

    checkForUpdate();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleUpdate = useCallback(async () => {
    try {
      const update = await check();
      if (!update) return;

      setState({ status: 'downloading', progress: 0 });

      let totalLength = 0;
      let downloaded = 0;

      await update.downloadAndInstall((event) => {
        if (event.event === 'Started') {
          totalLength = event.data.contentLength ?? 0;
        } else if (event.event === 'Progress') {
          downloaded += event.data.chunkLength;
          const pct = totalLength > 0 ? Math.round((downloaded / totalLength) * 100) : 0;
          setState({ status: 'downloading', progress: pct });
        } else if (event.event === 'Finished') {
          setState({ status: 'installing' });
        }
      });

      // Relaunch the app after installation
      await relaunch();
    } catch (err) {
      console.warn('[UpdateChecker] Update download/install failed:', err);
      // Fall back to available state so user can retry
      setState((prev) =>
        prev.status === 'downloading' || prev.status === 'installing'
          ? { status: 'available', version: '' }
          : prev
      );
    }
  }, []);

  const handleDismiss = useCallback(() => {
    setState({ status: 'dismissed' });
  }, []);

  // Render nothing when no update or dismissed
  if (state.status === 'idle' || state.status === 'dismissed') {
    return null;
  }

  return (
    <div className="flex items-center justify-between gap-3 border-b border-border bg-blue-50 px-4 py-2 text-sm dark:bg-blue-950/30">
      {state.status === 'available' && (
        <>
          <span className="text-foreground">
            Update available: <strong>v{state.version}</strong>
          </span>
          <div className="flex gap-2">
            <button
              onClick={handleUpdate}
              className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
            >
              Update Now
            </button>
            <button
              onClick={handleDismiss}
              className="rounded-md px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted"
            >
              Later
            </button>
          </div>
        </>
      )}

      {state.status === 'downloading' && (
        <>
          <span className="text-foreground">
            Downloading update... {state.progress}%
          </span>
          <div className="h-1.5 w-32 overflow-hidden rounded-full bg-blue-200 dark:bg-blue-900">
            <div
              className="h-full rounded-full bg-blue-600 transition-all dark:bg-blue-400"
              style={{ width: `${state.progress}%` }}
            />
          </div>
        </>
      )}

      {state.status === 'installing' && (
        <span className="text-foreground">
          Installing update... The app will restart shortly.
        </span>
      )}
    </div>
  );
}
