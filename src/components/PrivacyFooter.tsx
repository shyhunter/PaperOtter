import { useState } from 'react';
import { Lock } from 'lucide-react';
import { PrivacyModal } from '@/components/PrivacyModal';
import { t } from '@/i18n';

export function PrivacyFooter() {
  const [showModal, setShowModal] = useState(false);

  return (
    <footer className="flex items-center justify-center gap-1.5 py-2 border-t border-border/40 text-muted-foreground">
      <Lock className="h-3 w-3" />
      <button
        type="button"
        onClick={() => setShowModal(true)}
        className="text-xs hover:text-foreground transition-colors"
      >
        {t('privacyFooter.processedLocallyPrivacy')}
      </button>
      <PrivacyModal open={showModal} onClose={() => setShowModal(false)} />
    </footer>
  );
}
