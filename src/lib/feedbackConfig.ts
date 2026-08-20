const FEEDBACK_CONFIG_URL =
  'https://raw.githubusercontent.com/shyhunter/Papercut/main/feedback-config.json';

/** Baked in at build time as a fallback only -- the authoritative address
 * lives in feedback-config.json on the main branch, so it can be updated
 * without shipping a new release. */
export const FALLBACK_FEEDBACK_EMAIL = 'aidrivenstoriestotell@gmail.com';

/** Fetches the feedback contact email from feedback-config.json. Never
 * throws -- any network/parse failure or invalid value falls back to
 * FALLBACK_FEEDBACK_EMAIL. */
export async function fetchFeedbackEmail(): Promise<string> {
  try {
    const { fetch } = await import('@tauri-apps/plugin-http');
    const response = await fetch(FEEDBACK_CONFIG_URL);
    if (!response.ok) return FALLBACK_FEEDBACK_EMAIL;

    const data = await response.json();
    if (typeof data.feedbackEmail !== 'string' || !/^\S+@\S+\.\S+$/.test(data.feedbackEmail)) {
      return FALLBACK_FEEDBACK_EMAIL;
    }
    return data.feedbackEmail;
  } catch {
    return FALLBACK_FEEDBACK_EMAIL;
  }
}
