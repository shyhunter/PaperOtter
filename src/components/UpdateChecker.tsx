import { useState, useEffect } from 'react';
import { Sparkles, X } from 'lucide-react';
import { LazyStore } from '@tauri-apps/plugin-store';
import { openUrl } from '@tauri-apps/plugin-opener';
import { fetchLatestRelease, isNewerVersion, type LatestRelease } from '@/lib/checkForUpdate';
import { t } from '@/i18n';

const store = new LazyStore('papercut-settings.json');

export function UpdateChecker() {
  const [release, setRelease] = useState<LatestRelease | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      const [{ getVersion }, latest, dismissedVersion] = await Promise.all([
        import('@tauri-apps/api/app'),
        fetchLatestRelease(),
        store.get<string>('update-dismissed-version').catch(() => undefined),
      ]);
      if (cancelled || !latest) return;

      const currentVersion = await getVersion();
      if (!isNewerVersion(latest.version, currentVersion)) return;
      if (dismissedVersion && !isNewerVersion(latest.version, dismissedVersion)) return;

      setRelease(latest);
    }

    check();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!release || dismissed) return null;

  const handleDismiss = async () => {
    setDismissed(true);
    try {
      await store.set('update-dismissed-version', release.version);
      await store.save();
    } catch {
      // Dismissal state is already set in React — persistence failure is non-critical
    }
  };

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-accent/50 border-b border-border/40">
      <div className="flex items-center gap-2 text-sm text-foreground">
        <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
        <span>Papercut v{release.version} is available.</span>
        <button
          type="button"
          onClick={() => openUrl(release.url).catch(() => {})}
          className="text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
        >
          {t('updateChecker.download')}
        </button>
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded shrink-0"
        aria-label={t('updateChecker.dismissUpdateBanner')}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
