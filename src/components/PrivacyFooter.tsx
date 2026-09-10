import { useState } from 'react';
import { Lock } from 'lucide-react';
import { PrivacyModal } from '@/components/PrivacyModal';
import { t } from '@/i18n';

/**
 * The standing privacy line under every tool.
 *
 * A footnote, not a section. It sat on py-2 behind a full-strength rule, which
 * gave a one-line claim the same visual weight as a toolbar and made it read as
 * chrome competing with the tool above it.
 */
export function PrivacyFooter() {
  const [showModal, setShowModal] = useState(false);

  return (
    <footer data-testid="privacy-footer" className="flex items-center justify-center gap-2 py-2 border-t-2 border-border/40 text-muted-foreground">
      <Lock className="h-2.5 w-2.5" aria-hidden="true" />
      <button
        type="button"
        onClick={() => setShowModal(true)}
        className="text-[10px] hover:text-foreground transition-colors"
      >
        {t('privacyFooter.processedLocallyPrivacy')}
      </button>
      <PrivacyModal open={showModal} onClose={() => setShowModal(false)} />
    </footer>
  );
}
