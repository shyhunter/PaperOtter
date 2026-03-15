import { useState, useEffect } from 'react';
import { Lock, X } from 'lucide-react';
import { LazyStore } from '@tauri-apps/plugin-store';
import { PrivacyModal } from '@/components/PrivacyModal';

const store = new LazyStore('papercut-settings.json');

export function FirstLaunchBanner() {
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    let cancelled = false;
    store
      .get<boolean>('privacy-banner-dismissed')
      .then((val) => {
        if (!cancelled && val === true) {
          setDismissed(true);
        }
      })
      .catch(() => {
        // Store not available yet — show banner
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading || dismissed) return null;

  const handleDismiss = async () => {
    setDismissed(true);
    try {
      await store.set('privacy-banner-dismissed', true);
      await store.save();
    } catch {
      // Dismissal state is already set in React — persistence failure is non-critical
    }
  };

  return (
    <>
      <div className="flex items-center justify-between px-4 py-2 bg-accent/50 border-b border-border/40">
        <div className="flex items-center gap-2 text-sm text-foreground">
          <Lock className="h-3.5 w-3.5 text-green-500 shrink-0" />
          <span>Your files never leave your device.</span>
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
          >
            Learn more
          </button>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded shrink-0"
          aria-label="Dismiss privacy banner"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <PrivacyModal open={showModal} onClose={() => setShowModal(false)} />
    </>
  );
}
