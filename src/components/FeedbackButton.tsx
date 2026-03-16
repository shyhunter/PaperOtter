import { useCallback } from 'react';
import { MessageSquarePlus } from 'lucide-react';
import { openUrl } from '@tauri-apps/plugin-opener';

// TODO: Replace with actual GitHub repo URL when public
const GITHUB_REPO_URL = 'https://github.com/TODO_USERNAME/papercut';

async function getSystemInfo(): Promise<string> {
  let version = 'unknown';
  try {
    const { getVersion } = await import('@tauri-apps/api/app');
    version = await getVersion();
  } catch {
    // fallback
  }

  const os = navigator.platform || 'unknown';
  const theme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';

  return [
    `- App Version: ${version}`,
    `- OS: ${os}`,
    `- Theme: ${theme}`,
  ].join('\n');
}

export function FeedbackButton() {
  const handleClick = useCallback(async () => {
    const systemInfo = await getSystemInfo();

    const body = [
      '## Feedback',
      '',
      '<!-- Describe your feedback here -->',
      '',
      '',
      '## System Info',
      systemInfo,
    ].join('\n');

    const url = `${GITHUB_REPO_URL}/issues/new?labels=feedback&body=${encodeURIComponent(body)}`;

    try {
      await openUrl(url);
    } catch (err) {
      console.warn('[FeedbackButton] Could not open browser:', err);
    }
  }, []);

  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      title="Send feedback"
    >
      <MessageSquarePlus className="h-3.5 w-3.5" />
      <span>Feedback</span>
    </button>
  );
}
