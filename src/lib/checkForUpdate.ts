const RELEASES_URL = 'https://api.github.com/repos/shyhunter/PaperOtter/releases/latest';
const RELEASES_PAGE = 'https://github.com/shyhunter/PaperOtter/releases';

/** The update button opens this link, so only this repo's releases on
 * github.com over https get through; anything else opens the releases page.
 * Same rule as the Feedback link in feedbackConfig.ts. */
function safeReleaseUrl(value: string): string {
  try {
    const url = new URL(value);
    const ok = url.protocol === 'https:' && url.host === 'github.com'
      && url.pathname.startsWith('/shyhunter/PaperOtter/releases/');
    return ok ? url.toString() : RELEASES_PAGE;
  } catch {
    return RELEASES_PAGE;
  }
}

export interface LatestRelease {
  version: string;
  notes: string;
  url: string;
}

/** Numeric major.minor.patch comparison — no pre-release handling needed since
 * GitHub's /releases/latest endpoint already excludes drafts and pre-releases. */
export function isNewerVersion(candidate: string, current: string): boolean {
  const c = candidate.split('.').map(Number);
  const r = current.split('.').map(Number);
  if (c.some(Number.isNaN) || r.some(Number.isNaN) || c.length !== 3 || r.length !== 3) {
    return false;
  }
  for (let i = 0; i < 3; i++) {
    if (c[i] > r[i]) return true;
    if (c[i] < r[i]) return false;
  }
  return false;
}

/** Fetches the latest published release from GitHub. Never throws — any
 * network/parse failure resolves to null so callers can treat "no update
 * info" the same as "up to date" and skip the banner silently. */
export async function fetchLatestRelease(): Promise<LatestRelease | null> {
  try {
    const { fetch } = await import('@tauri-apps/plugin-http');
    const response = await fetch(RELEASES_URL, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!response.ok) return null;

    const data = await response.json();
    if (typeof data.tag_name !== 'string' || typeof data.html_url !== 'string') return null;

    return {
      version: data.tag_name.replace(/^v/, ''),
      notes: typeof data.body === 'string' ? data.body : '',
      url: safeReleaseUrl(data.html_url),
    };
  } catch {
    return null;
  }
}
