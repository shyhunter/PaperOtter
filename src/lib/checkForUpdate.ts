const RELEASES_URL = 'https://api.github.com/repos/shyhunter/PaperOtter/releases/latest';

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
      url: data.html_url,
    };
  } catch {
    return null;
  }
}
