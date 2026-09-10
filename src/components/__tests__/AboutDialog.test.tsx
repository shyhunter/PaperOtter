// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { fetchFeedbackUrl, FALLBACK_FEEDBACK_URL } from '@/lib/feedbackConfig';
import { AboutDialog } from '@/components/AboutDialog';

vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn(() => Promise.resolve()) }));

vi.mock('@/lib/feedbackConfig', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/feedbackConfig')>();
  return { ...actual, fetchFeedbackUrl: vi.fn() };
});

vi.mock('@tauri-apps/api/app', () => ({ getVersion: vi.fn(() => Promise.resolve('1.0.0')) }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('AboutDialog', () => {
  it('AD-01: Send Feedback opens a mailto link using the fetched address', async () => {
    vi.mocked(fetchFeedbackUrl).mockResolvedValue('https://github.com/shyhunter/Other/discussions');
    render(<AboutDialog open onClose={() => {}} />);

    const button = await screen.findByRole('button', { name: /send feedback/i });
    await waitFor(() => expect(fetchFeedbackUrl).toHaveBeenCalled());
    fireEvent.click(button);

    expect(openUrl).toHaveBeenCalledWith(
      'https://github.com/shyhunter/Other/discussions',
    );
  });

  it('AD-02: Send Feedback falls back to the default address while the fetch is pending or fails', async () => {
    vi.mocked(fetchFeedbackUrl).mockResolvedValue(FALLBACK_FEEDBACK_URL);
    render(<AboutDialog open onClose={() => {}} />);

    const button = await screen.findByRole('button', { name: /send feedback/i });
    fireEvent.click(button);

    expect(openUrl).toHaveBeenCalledWith(
      FALLBACK_FEEDBACK_URL,
    );
  });
});
