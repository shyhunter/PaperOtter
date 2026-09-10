import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetch } from '@tauri-apps/plugin-http';
import {
  fetchFeedbackUrl,
  newDiscussionUrl,
  FALLBACK_FEEDBACK_URL,
} from '@/lib/feedbackConfig';

vi.mock('@tauri-apps/plugin-http', () => ({ fetch: vi.fn() }));

afterEach(() => {
  vi.clearAllMocks();
});

describe('fetchFeedbackUrl', () => {
  it('FBC-01: returns the url from a successful response', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ feedbackUrl: 'https://github.com/shyhunter/Other/discussions' }),
    } as Response);

    expect(await fetchFeedbackUrl()).toBe('https://github.com/shyhunter/Other/discussions');
  });

  it('FBC-02: falls back to the default on a non-200 response', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    expect(await fetchFeedbackUrl()).toBe(FALLBACK_FEEDBACK_URL);
  });

  it('FBC-03: falls back to the default on a network error', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('network down'));
    expect(await fetchFeedbackUrl()).toBe(FALLBACK_FEEDBACK_URL);
  });

  it('FBC-04: falls back to the default on a malformed payload', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ unexpected: 'shape' }),
    } as Response);
    expect(await fetchFeedbackUrl()).toBe(FALLBACK_FEEDBACK_URL);
  });

  // The config is fetched over the network, so a tampered value must never
  // become a link the app opens for the user.
  it.each([
    ['a non-github host', 'https://evil.example.com/discussions'],
    ['plain http', 'http://github.com/shyhunter/Papercut/discussions'],
    ['a javascript: url', 'javascript:alert(1)'],
    ['a lookalike host', 'https://github.com.evil.example.com/x'],
    ['not a url at all', 'discussions'],
  ])('FBC-05: refuses %s', async (_label, value) => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ feedbackUrl: value }),
    } as Response);
    expect(await fetchFeedbackUrl()).toBe(FALLBACK_FEEDBACK_URL);
  });
});

describe('newDiscussionUrl', () => {
  it('FBC-06: pre-fills the compose form without posting anything', () => {
    const url = new URL(newDiscussionUrl(FALLBACK_FEEDBACK_URL, 'Crash: boom', 'stack\nlines'));
    expect(url.pathname.endsWith('/discussions/new')).toBe(true);
    expect(url.searchParams.get('title')).toBe('Crash: boom');
    expect(url.searchParams.get('body')).toBe('stack\nlines');
  });

  it('FBC-07: tolerates a trailing slash on the base', () => {
    const url = new URL(newDiscussionUrl(`${FALLBACK_FEEDBACK_URL}/`, 't', 'b'));
    expect(url.pathname.endsWith('/discussions/new')).toBe(true);
  });
});
