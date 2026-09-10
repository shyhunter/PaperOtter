import { Coffee } from 'lucide-react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { t } from '@/i18n';

const BMC_URL = 'https://buymeacoffee.com/shyhunter';

// Colors match the official Buy Me a Coffee button widget (buymeacoffee.com/shyhunter)
// so the native button reads as the same brand element without loading their remote
// <script> widget, which would add an external network call and break the app's CSP.
export function BuyMeACoffeeButton() {
  return (
    <button
      type="button"
      onClick={() => openUrl(BMC_URL).catch(() => {})}
      className="inline-flex items-center gap-1.5 border-2 border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground [border-radius:12px_5px_14px_6px_/_6px_14px_5px_12px] transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      title={t('support.buyMeACoffee')}
    >
      <Coffee className="h-3.5 w-3.5 fill-primary text-primary" />
      <span>{t('buyMeAcoffeeButton.buyMeACoffee')}</span>
    </button>
  );
}
