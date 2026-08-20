import { Coffee } from 'lucide-react';
import { openUrl } from '@tauri-apps/plugin-opener';

const BMC_URL = 'https://buymeacoffee.com/shyhunter';

// Colors match the official Buy Me a Coffee button widget (buymeacoffee.com/shyhunter)
// so the native button reads as the same brand element without loading their remote
// <script> widget, which would add an external network call and break the app's CSP.
export function BuyMeACoffeeButton() {
  return (
    <button
      type="button"
      onClick={() => openUrl(BMC_URL).catch(() => {})}
      className="inline-flex items-center gap-1.5 rounded-full border border-black bg-[#FF5F5F] px-3 py-1.5 text-xs font-semibold text-white transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      title="Buy me a coffee"
    >
      <Coffee className="h-3.5 w-3.5 fill-[#FFDD00] text-[#FFDD00]" />
      <span>Buy me a coffee</span>
    </button>
  );
}
