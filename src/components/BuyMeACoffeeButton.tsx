import { Coffee } from 'lucide-react';
import { openUrl } from '@tauri-apps/plugin-opener';

// TODO: replace with your real Buy Me a Coffee page once created
const BMC_URL = 'https://buymeacoffee.com/shyhunter';

export function BuyMeACoffeeButton() {
  return (
    <button
      type="button"
      onClick={() => openUrl(BMC_URL).catch(() => {})}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      title="Buy me a coffee"
    >
      <Coffee className="h-3.5 w-3.5" />
      <span>Buy me a coffee</span>
    </button>
  );
}
