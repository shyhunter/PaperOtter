import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetch } from '@tauri-apps/plugin-http';
import { fetchFeedbackEmail, FALLBACK_FEEDBACK_EMAIL } from '@/lib/feedbackConfig';

vi.mock('@tauri-apps/plugin-http', () => ({ fetch: vi.fn() }));

afterEach(() => {
  vi.clearAllMocks();
});

describe('fetchFeedbackEmail', () => {
  it('FBC-01: returns the email from a successful response', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ feedbackEmail: 'someone-else@example.com' }),
    } as Response);

    expect(await fetchFeedbackEmail()).toBe('someone-else@example.com');
  });

  it('FBC-02: falls back to the default on a non-200 response', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    expect(await fetchFeedbackEmail()).toBe(FALLBACK_FEEDBACK_EMAIL);
  });

  it('FBC-03: falls back to the default on a network error', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('network down'));
    expect(await fetchFeedbackEmail()).toBe(FALLBACK_FEEDBACK_EMAIL);
  });

  it('FBC-04: falls back to the default on a malformed payload', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ unexpected: 'shape' }),
    } as Response);
    expect(await fetchFeedbackEmail()).toBe(FALLBACK_FEEDBACK_EMAIL);
  });

  it('FBC-05: falls back to the default when feedbackEmail is not a valid-looking email', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ feedbackEmail: 'not-an-email' }),
    } as Response);
    expect(await fetchFeedbackEmail()).toBe(FALLBACK_FEEDBACK_EMAIL);
  });
});
