import { useState, useEffect, useCallback } from 'react';
import { X, ExternalLink } from 'lucide-react';
import { openUrl, revealItemInDir } from '@tauri-apps/plugin-opener';
import { resolveResource } from '@tauri-apps/api/path';
import { fetchFeedbackUrl, FALLBACK_FEEDBACK_URL } from '@/lib/feedbackConfig';
import { t } from '@/i18n';

const GITHUB_REPO_URL = 'https://github.com/shyhunter/PaperOtter';
/** The public roadmap: what is planned, and what was decided against. */
const ROADMAP_URL = 'https://github.com/users/shyhunter/projects/9';
/** Read from the bundle first; this is only the fallback if that path fails. */
const NOTICES_URL = 'https://github.com/shyhunter/PaperOtter/blob/main/THIRD-PARTY-LICENSES.md';

const APP_VERSION_FALLBACK = '1.0.0';

interface AboutDialogProps {
  open: boolean;
  onClose: () => void;
}

export function AboutDialog({ open, onClose }: AboutDialogProps) {
  const [version, setVersion] = useState(APP_VERSION_FALLBACK);
  const [feedbackUrl, setFeedbackUrl] = useState(FALLBACK_FEEDBACK_URL);

  useEffect(() => {
    if (!open) return;
    import('@tauri-apps/api/app')
      .then((mod) => mod.getVersion())
      .then(setVersion)
      .catch(() => setVersion(APP_VERSION_FALLBACK));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    fetchFeedbackUrl().then(setFeedbackUrl);
  }, [open]);

  // Several of the bundled licences require their notice to travel with the
  // binary rather than live only in the repository, so the file is bundled and
  // this reveals it on disk, staying useful with no network. Revealing
  // rather than opening is deliberate: `opener:default` already permits it,
  // whereas opening a path would mean widening the capability for one button.
  const handleNotices = useCallback(() => {
    resolveResource('licenses/THIRD-PARTY-LICENSES.md')
      .then(revealItemInDir)
      .catch(() => openUrl(NOTICES_URL).catch(() => {}));
  }, []);

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
      aria-label={t('chrome.about')}
    >
      <div data-modal-panel className="relative mx-4 w-full max-w-sm border-border bg-card p-6 space-y-5">
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 end-3 p-1 rounded-md text-muted-foreground hover:text-foreground transition-colors"
          aria-label={t('common.close')}
        >
          <X className="h-4 w-4" />
        </button>

        {/* App identity */}
        <div className="text-center space-y-1">
          <h2 className="text-xl font-bold text-foreground tracking-tight">PaperOtter</h2>
          <p className="text-xs text-muted-foreground/60 font-mono">v{version}</p>
          <p className="text-sm text-muted-foreground">
            {t('common.yourLocalDocumentToolkitPrivate')}
          </p>
        </div>

        {/* Privacy statement */}
        <div className="rounded-lg bg-muted/50 px-4 py-3 text-center">
          <p className="text-xs text-muted-foreground leading-relaxed">
            {t('aboutDialog.allProcessingHappensLocallyNo')}
          </p>
        </div>

        {/* Translation honesty. Sits with the privacy statement deliberately:
            both are claims about what this app is, and one of them is a
            limitation. Burying it would be the wrong kind of polish. */}
        <p className="px-1 text-[11px] text-muted-foreground leading-relaxed text-center">
          {t('aboutDialog.translationsNotNativeReviewed')}
        </p>

        {/* Details */}
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t('aboutDialog.license')}</span>
            <span className="text-foreground font-medium">MIT</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t('aboutDialog.includes')}</span>
            <span className="text-foreground font-medium">qpdf (Apache-2.0)</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t('aboutDialog.builtWith')}</span>
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
            onClick={handleNotices}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ExternalLink className="h-3 w-3" />
            {t('aboutDialog.thirdPartyNotices')}
          </button>
          <button
            type="button"
            onClick={() => openUrl(ROADMAP_URL).catch(() => {})}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ExternalLink className="h-3 w-3" />
            {t('aboutDialog.roadmap')}
          </button>
          <button
            type="button"
            onClick={() =>
              openUrl(feedbackUrl).catch(() => {})
            }
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ExternalLink className="h-3 w-3" />
            {t('aboutDialog.sendFeedback')}
          </button>
        </div>
      </div>
    </div>
  );
}
