// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { fetchFeedbackUrl, FALLBACK_FEEDBACK_URL } from '@/lib/feedbackConfig';
import { getSystemInfo } from '@/lib/systemInfo';
import { CrashReporter } from '@/components/CrashReporter';

vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn(() => Promise.resolve()) }));

vi.mock('@/lib/feedbackConfig', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/feedbackConfig')>();
  return { ...actual, fetchFeedbackUrl: vi.fn() };
});

vi.mock('@tauri-apps/api/app', () => ({ getVersion: vi.fn(() => Promise.resolve('1.0.0')) }));

vi.mock('@/lib/systemInfo', () => ({ getSystemInfo: vi.fn(() => Promise.resolve('macOS (aarch64)')) }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderReporter(message = 'Boom went the processor') {
  return render(
    <CrashReporter
      error={new Error(message)}
      componentStack={'\n    at PdfProcessor\n    at App'}
      recoveryLabel="Reset this step"
      onRecover={() => {}}
    />,
  );
}

async function clickSend() {
  const button = await screen.findByRole('button', { name: /send crash report/i });
  fireEvent.click(button);
  await waitFor(() => expect(openUrl).toHaveBeenCalled());
  return vi.mocked(openUrl).mock.calls[0][0] as string;
}

describe('CrashReporter', () => {
  it('CR-01: Send Crash Report opens the fetched discussion URL', async () => {
    vi.mocked(fetchFeedbackUrl).mockResolvedValue('https://github.com/shyhunter/Other/discussions');
    renderReporter();

    const url = await clickSend();

    expect(url.startsWith('https://github.com/shyhunter/Other/discussions/new?')).toBe(true);
    expect(new URL(url).searchParams.get('title')).toBe('Crash: Boom went the processor');
  });

  it('CR-02: falls back to the default address when the fetch fails', async () => {
    vi.mocked(fetchFeedbackUrl).mockResolvedValue(FALLBACK_FEEDBACK_URL);
    renderReporter();

    const url = await clickSend();

    expect(url.startsWith(`${FALLBACK_FEEDBACK_URL}/new?`)).toBe(true);
  });

  it('CR-03: goes to Discussions, never Issues (/issues/new 404s while private)', async () => {
    vi.mocked(fetchFeedbackUrl).mockResolvedValue(FALLBACK_FEEDBACK_URL);
    renderReporter();

    const url = await clickSend();

    expect(url).toContain('/discussions/new');
    expect(url).not.toContain('issues/new');
    expect(url.startsWith('mailto:')).toBe(false);
  });

  it('CR-03b: names a category that exists, or GitHub drops the user on an error', async () => {
    vi.mocked(fetchFeedbackUrl).mockResolvedValue(FALLBACK_FEEDBACK_URL);
    renderReporter();

    const url = new URL(await clickSend());

    // The repo's default set; there is no API to create categories.
    expect(['general', 'ideas', 'q-a', 'announcements', 'polls', 'show-and-tell'])
      .toContain(url.searchParams.get('category'));
  });

  it('CR-04: the discussion body carries the error message, component stack and system info', async () => {
    vi.mocked(fetchFeedbackUrl).mockResolvedValue(FALLBACK_FEEDBACK_URL);
    renderReporter();

    const body = new URL(await clickSend()).searchParams.get('body') ?? '';

    expect(body).toContain('Boom went the processor');
    expect(body).toContain('at PdfProcessor');
    expect(body).toContain('App Version: 1.0.0');
  });

  it('CR-05: the preview says nothing is posted until the user posts it', async () => {
    vi.mocked(fetchFeedbackUrl).mockResolvedValue(FALLBACK_FEEDBACK_URL);
    renderReporter();

    fireEvent.click(screen.getByRole('button', { name: /preview what will be sent/i }));

    // The body carries system details, so the promise that nothing leaves the
    // machine unattended has to be on screen, not just in the code.
    expect(screen.getByText(/nothing is posted until you post it yourself/i)).toBeInTheDocument();
    expect(screen.queryByText(/draft email/i)).not.toBeInTheDocument();
  });
  it('CR-06: the report carries the real OS and architecture, not navigator.platform', async () => {
    vi.mocked(fetchFeedbackUrl).mockResolvedValue(FALLBACK_FEEDBACK_URL);
    vi.mocked(getSystemInfo).mockResolvedValue('macOS (aarch64)');
    renderReporter();

    const body = new URL(await clickSend()).searchParams.get('body') ?? '';

    expect(body).toContain('OS: macOS (aarch64)');
    expect(body).not.toContain('MacIntel');
  });

  it('CR-07: the preview shows the same OS string the report will carry', async () => {
    vi.mocked(fetchFeedbackUrl).mockResolvedValue(FALLBACK_FEEDBACK_URL);
    vi.mocked(getSystemInfo).mockResolvedValue('Windows (x86_64)');
    renderReporter();

    fireEvent.click(screen.getByRole('button', { name: /preview what will be sent/i }));

    expect(await screen.findByText(/OS: Windows \(x86_64\)/)).toBeTruthy();
  });
});
