import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetch } from '@tauri-apps/plugin-http';
import { fetchLatestRelease, isNewerVersion } from '@/lib/checkForUpdate';

vi.mock('@tauri-apps/plugin-http', () => ({ fetch: vi.fn() }));

afterEach(() => {
  vi.clearAllMocks();
});

describe('isNewerVersion', () => {
  it('CFU-01: returns true when candidate is newer (patch/minor/major)', () => {
    expect(isNewerVersion('1.0.1', '1.0.0')).toBe(true);
    expect(isNewerVersion('1.1.0', '1.0.9')).toBe(true);
    expect(isNewerVersion('2.0.0', '1.9.9')).toBe(true);
  });

  it('CFU-02: returns false when candidate is older or equal', () => {
    expect(isNewerVersion('1.0.0', '1.0.1')).toBe(false);
    expect(isNewerVersion('1.0.0', '1.0.0')).toBe(false);
  });

  it('CFU-03: returns false for malformed version strings', () => {
    expect(isNewerVersion('1.0.0-beta.9', '1.0.0')).toBe(false);
    expect(isNewerVersion('not-a-version', '1.0.0')).toBe(false);
    expect(isNewerVersion('1.0', '1.0.0')).toBe(false);
  });
});

describe('fetchLatestRelease', () => {
  it('CFU-04: parses a successful response', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          tag_name: 'v1.1.0',
          body: 'Bug fixes and improvements',
          html_url: 'https://github.com/shyhunter/PaperOtter/releases/tag/v1.1.0',
        }),
    } as Response);

    const result = await fetchLatestRelease();
    expect(result).toEqual({
      version: '1.1.0',
      notes: 'Bug fixes and improvements',
      url: 'https://github.com/shyhunter/PaperOtter/releases/tag/v1.1.0',
    });
  });

  it('CFU-05: returns null on a non-200 response', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    expect(await fetchLatestRelease()).toBeNull();
  });

  it('CFU-06: returns null on a network error', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('network down'));
    expect(await fetchLatestRelease()).toBeNull();
  });

  it('CFU-07: returns null on malformed JSON payload', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ unexpected: 'shape' }),
    } as Response);
    expect(await fetchLatestRelease()).toBeNull();
  });
});
