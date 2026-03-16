import { useState, useEffect, useCallback } from 'react';
import { X, ExternalLink } from 'lucide-react';
import { openUrl } from '@tauri-apps/plugin-opener';

// TODO: Replace with actual GitHub repo URL when public
const GITHUB_REPO_URL = 'https://github.com/shyhunter/papercut';

const APP_VERSION_FALLBACK = '1.0.0-beta.1';

interface AboutDialogProps {
  open: boolean;
  onClose: () => void;
}

export function AboutDialog({ open, onClose }: AboutDialogProps) {
  const [version, setVersion] = useState(APP_VERSION_FALLBACK);

  useEffect(() => {
    if (!open) return;
    import('@tauri-apps/api/app')
      .then((mod) => mod.getVersion())
      .then(setVersion)
      .catch(() => setVersion(APP_VERSION_FALLBACK));
  }, [open]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-label="About Papercut"
    >
      <div className="relative mx-4 w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-xl space-y-5">
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 p-1 rounded-md text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        {/* App identity */}
        <div className="text-center space-y-1">
          <h2 className="text-xl font-bold text-foreground tracking-tight">Papercut</h2>
          <p className="text-xs text-muted-foreground/60 font-mono">v{version}</p>
          <p className="text-sm text-muted-foreground">
            Your local document toolkit — private, fast, offline.
          </p>
        </div>

        {/* Privacy statement */}
        <div className="rounded-lg bg-muted/50 px-4 py-3 text-center">
          <p className="text-xs text-muted-foreground leading-relaxed">
            All processing happens locally. No data ever leaves your computer.
          </p>
        </div>

        {/* Details */}
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">License</span>
            <span className="text-foreground font-medium">MIT</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Built with</span>
            <span className="text-foreground font-medium">Tauri + React</span>
          </div>
        </div>

        {/* Links */}
        <div className="flex justify-center gap-4 pt-1">
          <button
            type="button"
            onClick={() => openUrl(GITHUB_REPO_URL).catch(() => {})}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ExternalLink className="h-3 w-3" />
            GitHub
          </button>
          <button
            type="button"
            onClick={() =>
              openUrl(`${GITHUB_REPO_URL}/issues/new?labels=feedback`).catch(() => {})
            }
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ExternalLink className="h-3 w-3" />
            Send Feedback
          </button>
        </div>
      </div>
    </div>
  );
}
