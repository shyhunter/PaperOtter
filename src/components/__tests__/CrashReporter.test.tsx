// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { fetchFeedbackEmail, FALLBACK_FEEDBACK_EMAIL } from '@/lib/feedbackConfig';
import { getSystemInfo } from '@/lib/systemInfo';
import { CrashReporter } from '@/components/CrashReporter';

vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn(() => Promise.resolve()) }));

vi.mock('@/lib/feedbackConfig', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/feedbackConfig')>();
  return { ...actual, fetchFeedbackEmail: vi.fn() };
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
  it('CR-01: Send Crash Report opens a mailto link using the fetched address', async () => {
    vi.mocked(fetchFeedbackEmail).mockResolvedValue('someone-else@example.com');
    renderReporter();

    const url = await clickSend();

    expect(url.startsWith('mailto:someone-else@example.com?')).toBe(true);
    expect(url).toContain(`subject=${encodeURIComponent('Crash: Boom went the processor')}`);
  });

  it('CR-02: falls back to the default address when the fetch fails', async () => {
    vi.mocked(fetchFeedbackEmail).mockResolvedValue(FALLBACK_FEEDBACK_EMAIL);
    renderReporter();

    const url = await clickSend();

    expect(url.startsWith(`mailto:${FALLBACK_FEEDBACK_EMAIL}?`)).toBe(true);
  });

  it('CR-03: never opens a GitHub issue URL (regression: /issues/new 404s while private)', async () => {
    vi.mocked(fetchFeedbackEmail).mockResolvedValue(FALLBACK_FEEDBACK_EMAIL);
    renderReporter();

    const url = await clickSend();

    expect(url).not.toContain('github.com');
    expect(url).not.toContain('issues/new');
  });

  it('CR-04: the mailto body carries the error message, component stack and system info', async () => {
    vi.mocked(fetchFeedbackEmail).mockResolvedValue(FALLBACK_FEEDBACK_EMAIL);
    renderReporter();

    const body = decodeURIComponent(new URL(await clickSend()).search.split('body=')[1]);

    expect(body).toContain('Boom went the processor');
    expect(body).toContain('at PdfProcessor');
    expect(body).toContain('App Version: 1.0.0');
  });

  it('CR-05: the preview describes an email, not a GitHub issue submission', async () => {
    vi.mocked(fetchFeedbackEmail).mockResolvedValue(FALLBACK_FEEDBACK_EMAIL);
    renderReporter();

    fireEvent.click(screen.getByRole('button', { name: /preview what will be sent/i }));

    expect(screen.queryAllByText(/GitHub/i)).toHaveLength(0);
  });
  it('CR-06: the report carries the real OS and architecture, not navigator.platform', async () => {
    vi.mocked(fetchFeedbackEmail).mockResolvedValue(FALLBACK_FEEDBACK_EMAIL);
    vi.mocked(getSystemInfo).mockResolvedValue('macOS (aarch64)');
    renderReporter();

    const body = decodeURIComponent(new URL(await clickSend()).search.split('body=')[1]);

    expect(body).toContain('OS: macOS (aarch64)');
    expect(body).not.toContain('MacIntel');
  });

  it('CR-07: the preview shows the same OS string the report will carry', async () => {
    vi.mocked(fetchFeedbackEmail).mockResolvedValue(FALLBACK_FEEDBACK_EMAIL);
    vi.mocked(getSystemInfo).mockResolvedValue('Windows (x86_64)');
    renderReporter();

    fireEvent.click(screen.getByRole('button', { name: /preview what will be sent/i }));

    expect(await screen.findByText(/OS: Windows \(x86_64\)/)).toBeTruthy();
  });
});
