const FEEDBACK_CONFIG_URL =
  'https://raw.githubusercontent.com/shyhunter/Papercut/main/feedback-config.json';

/** Baked in at build time as a fallback only -- the authoritative destination
 * lives in feedback-config.json on the main branch, so it can be changed
 * without shipping a new release. */
export const FALLBACK_FEEDBACK_URL = 'https://github.com/shyhunter/Papercut/discussions';

/**
 * Only github.com over https is accepted. The config file is fetched from the
 * network, so a bad or tampered value must never become a link we open on the
 * user's behalf -- an arbitrary URL there would be an open redirect with the
 * app's own credibility behind it.
 */
function isAcceptable(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'github.com';
  } catch {
    return false;
  }
}

/** Fetches the feedback destination from feedback-config.json. Never throws --
 * any network/parse failure or unacceptable value falls back. */
export async function fetchFeedbackUrl(): Promise<string> {
  try {
    const { fetch } = await import('@tauri-apps/plugin-http');
    const response = await fetch(FEEDBACK_CONFIG_URL);
    if (!response.ok) return FALLBACK_FEEDBACK_URL;

    const data = await response.json();
    return isAcceptable(data.feedbackUrl) ? data.feedbackUrl : FALLBACK_FEEDBACK_URL;
  } catch {
    return FALLBACK_FEEDBACK_URL;
  }
}

/**
 * A pre-filled "new discussion" link. Nothing is posted: GitHub opens its own
 * compose form with these fields filled in, and the user still has to read them
 * and press the button. That matters for crash reports, which carry system
 * details the user should see before anything becomes public.
 */
export function newDiscussionUrl(base: string, title: string, body: string): string {
  const url = new URL(`${base.replace(/\/$/, '')}/new`);
  // "general" is one of GitHub's default categories, so this link works on a
  // fresh repo. There is no API to create categories, so if a dedicated
  // "Bug reports" category is added by hand, change the slug here.
  url.searchParams.set('category', 'general');
  url.searchParams.set('title', title);
  url.searchParams.set('body', body);
  return url.toString();
}
