// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { fetchLatestRelease } from '@/lib/checkForUpdate';
import { UpdateChecker } from '@/components/UpdateChecker';

vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn(() => Promise.resolve()) }));

vi.mock('@/lib/checkForUpdate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/checkForUpdate')>();
  return { ...actual, fetchLatestRelease: vi.fn() };
});

vi.mock('@tauri-apps/api/app', () => ({ getVersion: vi.fn(() => Promise.resolve('1.0.0')) }));

const storeGet = vi.fn((_key?: string) => Promise.resolve<string | undefined>(undefined));
const storeSet = vi.fn((_key: string, _value: string) => Promise.resolve(undefined));
vi.mock('@tauri-apps/plugin-store', () => ({
  LazyStore: class {
    get(key: string) {
      return storeGet(key);
    }
    set(key: string, value: string) {
      return storeSet(key, value);
    }
    save() {
      return Promise.resolve(undefined);
    }
  },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  storeGet.mockImplementation(() => Promise.resolve(undefined));
});

describe('UpdateChecker', () => {
  it('UC-01: shows a banner when a newer version is available and nothing dismissed', async () => {
    vi.mocked(fetchLatestRelease).mockResolvedValue({
      version: '1.1.0',
      notes: '',
      url: 'https://github.com/shyhunter/Papercut/releases/tag/v1.1.0',
    });
    render(<UpdateChecker />);
    expect(await screen.findByText(/paperotter v1\.1\.0 is available/i)).toBeInTheDocument();
  });

  it('UC-02: renders nothing when already up to date', async () => {
    vi.mocked(fetchLatestRelease).mockResolvedValue({
      version: '1.0.0',
      notes: '',
      url: 'https://example.com',
    });
    const { container } = render(<UpdateChecker />);
    await waitFor(() => expect(fetchLatestRelease).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('UC-03: renders nothing when the available version matches what was already dismissed', async () => {
    storeGet.mockResolvedValue('1.1.0');
    vi.mocked(fetchLatestRelease).mockResolvedValue({
      version: '1.1.0',
      notes: '',
      url: 'https://example.com',
    });
    const { container } = render(<UpdateChecker />);
    await waitFor(() => expect(fetchLatestRelease).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('UC-04: dismiss button persists the version and hides the banner', async () => {
    vi.mocked(fetchLatestRelease).mockResolvedValue({
      version: '1.1.0',
      notes: '',
      url: 'https://example.com',
    });
    render(<UpdateChecker />);
    const dismissButton = await screen.findByRole('button', { name: /dismiss update banner/i });
    fireEvent.click(dismissButton);

    expect(screen.queryByText(/paperotter v1\.1\.0 is available/i)).not.toBeInTheDocument();
    await waitFor(() => expect(storeSet).toHaveBeenCalledWith('update-dismissed-version', '1.1.0'));
  });

  it('UC-05: Download button opens the release URL', async () => {
    vi.mocked(fetchLatestRelease).mockResolvedValue({
      version: '1.1.0',
      notes: '',
      url: 'https://github.com/shyhunter/Papercut/releases/tag/v1.1.0',
    });
    render(<UpdateChecker />);
    fireEvent.click(await screen.findByRole('button', { name: /download/i }));
    expect(openUrl).toHaveBeenCalledWith('https://github.com/shyhunter/Papercut/releases/tag/v1.1.0');
  });

  it('UC-06: renders nothing when the fetch fails', async () => {
    vi.mocked(fetchLatestRelease).mockResolvedValue(null);
    const { container } = render(<UpdateChecker />);
    await waitFor(() => expect(fetchLatestRelease).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
