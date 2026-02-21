// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ImageConfigureStep } from '@/components/ImageConfigureStep';
import type { ImageProcessingResult } from '@/types/file';

afterEach(cleanup);

// ─── Shared props ─────────────────────────────────────────────────────────────

const onGeneratePreview = vi.fn();
const onBack = vi.fn();

const defaultProps = {
  fileName: 'photo.jpg',
  fileSizeBytes: 2_400_000,
  sourceFormat: 'jpeg' as const,
  isProcessing: false,
  error: null,
  lastResult: null,
  onGeneratePreview,
  onBack,
};

beforeEach(() => {
  onGeneratePreview.mockClear();
  onBack.mockClear();
});

// ─── Quality label ────────────────────────────────────────────────────────────

describe('ImageConfigureStep — quality label', () => {
  it('shows only percentage for JPEG format (default quality 80)', () => {
    render(<ImageConfigureStep {...defaultProps} />);
    // The quality label span must contain exactly "80%" — nothing more
    expect(screen.getByText('80%')).toBeInTheDocument();
  });

  it('does not append stale size from lastResult to the quality label', () => {
    const lastResult: ImageProcessingResult = {
      bytes: new Uint8Array(1),
      sourceBytes: new Uint8Array(1),
      inputSizeBytes: 2_400_000,
      outputSizeBytes: 1_280_000,
      outputFormat: 'jpeg',
      quality: 50,
      sourceWidth: 6000,
      sourceHeight: 2848,
      outputWidth: 6000,
      outputHeight: 2848,
    };
    render(<ImageConfigureStep {...defaultProps} lastResult={lastResult} />);
    // "80%" must exist as an exact text node — if the old bug were present the
    // label would be "80% — ~1.22 MB" and getByText('80%') would NOT find it.
    expect(screen.getByText('80%')).toBeInTheDocument();
    // Explicitly confirm the stale-size pattern is gone from the label
    expect(screen.queryByText(/80%.*—/)).not.toBeInTheDocument();
  });

  it('shows compression level for PNG format instead of a percentage', () => {
    render(<ImageConfigureStep {...defaultProps} sourceFormat="png" />);
    // quality=80 → PNG compression = round((100-80)*9/100) = 2
    expect(screen.getByText('Compression: 2/9')).toBeInTheDocument();
    // No bare "80%" label should appear — PNG uses the compression display
    expect(screen.queryByText('80%')).not.toBeInTheDocument();
  });
});

// ─── Slider — no auto-submit (Bug 1) ─────────────────────────────────────────

describe('ImageConfigureStep — quality slider does NOT auto-submit', () => {
  it('does NOT call onGeneratePreview when the slider is released (mouseUp)', () => {
    render(<ImageConfigureStep {...defaultProps} />);
    const slider = screen.getByRole('slider');
    fireEvent.mouseUp(slider);
    expect(onGeneratePreview).not.toHaveBeenCalled();
  });

  it('does NOT call onGeneratePreview when the slider value changes (onChange)', () => {
    render(<ImageConfigureStep {...defaultProps} />);
    const slider = screen.getByRole('slider');
    fireEvent.change(slider, { target: { value: '42' } });
    expect(onGeneratePreview).not.toHaveBeenCalled();
  });

  it('updates the quality label when the slider moves without submitting', () => {
    render(<ImageConfigureStep {...defaultProps} />);
    const slider = screen.getByRole('slider');
    fireEvent.change(slider, { target: { value: '42' } });
    expect(screen.getByText('42%')).toBeInTheDocument();
    expect(onGeneratePreview).not.toHaveBeenCalled();
  });
});

// ─── Generate Preview button ──────────────────────────────────────────────────

describe('ImageConfigureStep — Generate Preview button', () => {
  it('calls onGeneratePreview when the button is clicked', async () => {
    render(<ImageConfigureStep {...defaultProps} />);
    await userEvent.click(screen.getByRole('button', { name: /generate preview/i }));
    expect(onGeneratePreview).toHaveBeenCalledOnce();
  });

  it('passes quality=80 and format=jpeg by default', async () => {
    render(<ImageConfigureStep {...defaultProps} />);
    await userEvent.click(screen.getByRole('button', { name: /generate preview/i }));
    const opts = onGeneratePreview.mock.calls[0][0];
    expect(opts.quality).toBe(80);
    expect(opts.outputFormat).toBe('jpeg');
    expect(opts.resizeEnabled).toBe(false);
  });

  it('passes the slider quality value changed before clicking Generate Preview', async () => {
    render(<ImageConfigureStep {...defaultProps} />);
    fireEvent.change(screen.getByRole('slider'), { target: { value: '42' } });
    await userEvent.click(screen.getByRole('button', { name: /generate preview/i }));
    expect(onGeneratePreview.mock.calls[0][0].quality).toBe(42);
  });

  it('button shows "Processing…" and is disabled when isProcessing=true', () => {
    render(<ImageConfigureStep {...defaultProps} isProcessing />);
    const btn = screen.getByRole('button', { name: /processing/i });
    expect(btn).toBeDisabled();
  });
});

// ─── Format selector ──────────────────────────────────────────────────────────

describe('ImageConfigureStep — output format', () => {
  it('switching to PNG changes the quality label to compression display', async () => {
    render(<ImageConfigureStep {...defaultProps} />);
    await userEvent.click(screen.getByRole('button', { name: /^png$/i }));
    expect(screen.getByText(/Compression: \d\/9/)).toBeInTheDocument();
  });

  it('switching to WebP keeps the percentage quality label', async () => {
    render(<ImageConfigureStep {...defaultProps} />);
    await userEvent.click(screen.getByRole('button', { name: /^webp$/i }));
    expect(screen.getByText('80%')).toBeInTheDocument();
  });

  it('passes the selected format to onGeneratePreview', async () => {
    render(<ImageConfigureStep {...defaultProps} />);
    await userEvent.click(screen.getByRole('button', { name: /^webp$/i }));
    await userEvent.click(screen.getByRole('button', { name: /generate preview/i }));
    expect(onGeneratePreview.mock.calls[0][0].outputFormat).toBe('webp');
  });
});

// ─── Back button ──────────────────────────────────────────────────────────────

describe('ImageConfigureStep — Back button', () => {
  it('calls onBack when Back is clicked', async () => {
    render(<ImageConfigureStep {...defaultProps} />);
    await userEvent.click(screen.getByRole('button', { name: /^back$/i }));
    expect(onBack).toHaveBeenCalledOnce();
  });
});
