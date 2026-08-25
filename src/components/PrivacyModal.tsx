import { Shield, X } from 'lucide-react';
import { t } from '@/i18n';

interface PrivacyModalProps {
  open: boolean;
  onClose: () => void;
}

export function PrivacyModal({ open, onClose }: PrivacyModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      aria-modal="true"
      role="dialog"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-background text-foreground border border-border rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[85vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-green-500" />
            <h2 className="text-lg font-semibold">{t('privacy.title')}</h2>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded"
            aria-label={t('common.close')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Human-readable promise */}
        <div className="p-4 space-y-3">
          <p className="text-base font-medium">
            {t('privacy.headline')}
          </p>
          <p className="text-sm text-muted-foreground">
            {t('privacy.body')}
          </p>
          <p className="text-sm text-muted-foreground">
            {t('privacy.zeroData')}
          </p>
        </div>

        {/* Collapsible technical details */}
        <div className="px-4 pb-4">
          <details className="group">
            <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground transition-colors select-none">
              {t('privacy.technicalDetails')}
            </summary>
            <ul className="mt-2 space-y-2 text-xs text-muted-foreground list-disc list-inside">
              <li>Network access is scoped to exactly two read-only endpoints — checking for app updates and fetching the feedback contact address — enforced by Tauri capability config. No other network access is possible.</li>
              <li>{t('privacy.detailCsp')}</li>
              <li>{t('privacy.detailNoSdk')}</li>
              <li>{t('privacy.detailLocal')}</li>
              <li>{t('privacy.detailTemp')}</li>
              <li>{t('privacy.detailSweep')}</li>
              <li>{t('privacy.detailPasswords')}</li>
            </ul>
          </details>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
