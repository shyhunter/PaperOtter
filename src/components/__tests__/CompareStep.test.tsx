// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CompareStep } from '@/components/CompareStep';
import type { PdfProcessingResult } from '@/types/file';

afterEach(cleanup);

// Mock pdfThumbnail — PDF.js requires canvas + worker, unavailable in jsdom.
// Component tests verify UI rendering and interaction only.
vi.mock('@/lib/pdfThumbnail', () => ({
  renderAllPdfPages: vi.fn().mockResolvedValue([]),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeResult(overrides: Partial<PdfProcessingResult> = {}): PdfProcessingResult {
  return {
    bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]), // %PDF
    sourceBytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
    outputSizeBytes: 80_000,
    inputSizeBytes: 100_000,
    pageCount: 2,
    outputPageDimensions: { widthPt: 595.28, heightPt: 841.89 },
    targetMet: true,
    bestAchievableSizeBytes: null,
    ...overrides,
  };
}

const onSave = vi.fn();
const onBack = vi.fn();
const onStartOver = vi.fn();

beforeEach(() => {
  onSave.mockClear();
  onBack.mockClear();
  onStartOver.mockClear();
});

// Byte calculations for reference:
//   100,000 - 80,000 = 20,000 bytes → formatBytes → "19.5 KB" (20000/1024 = 19.53)
//   Math.round(20000/100000*100) = 20%  →  "−19.5 KB (20%)"

// ─── Stats bar ────────────────────────────────────────────────────────────────

describe('CompareStep — stats bar', () => {
  it('shows byte reduction and percentage when output is smaller', () => {
    render(<CompareStep result={makeResult()} onSave={onSave} onBack={onBack} onStartOver={onStartOver} />);
    // 100,000 - 80,000 = 20,000 bytes = 19.5 KB, 20%
    expect(screen.getByText('−19.5 KB (20%)')).toBeInTheDocument();
  });

  it('shows + prefix and byte growth when output is larger', () => {
    // 110,000 - 100,000 = 10,000 bytes = 9.8 KB, 10%
    render(<CompareStep result={makeResult({ outputSizeBytes: 110_000 })} onSave={onSave} onBack={onBack} onStartOver={onStartOver} />);
    expect(screen.getByText('+9.8 KB (10%)')).toBeInTheDocument();
  });

  it('shows page count', () => {
    render(<CompareStep result={makeResult({ pageCount: 6 })} onSave={onSave} onBack={onBack} onStartOver={onStartOver} />);
    expect(screen.getByText('6 pages')).toBeInTheDocument();
  });

  it('shows A4 dimensions in mm', () => {
    // 595.28 pt × 841.89 pt → 210 × 297 mm
    render(<CompareStep result={makeResult()} onSave={onSave} onBack={onBack} onStartOver={onStartOver} />);
    expect(screen.getByText('210 × 297 mm')).toBeInTheDocument();
  });
});

// ─── Structural-only notice (Bug 3) ──────────────────────────────────────────

describe('CompareStep — structural-only notice', () => {
  // The structural notice contains "image content is unchanged" which distinguishes
  // it from the target-not-met warning which says "PDF optimisation is structural only".
  it('appears when size delta is within 2% — quality level had no effect', () => {
    render(<CompareStep result={makeResult({ outputSizeBytes: 101_000 })} onSave={onSave} onBack={onBack} onStartOver={onStartOver} />);
    expect(screen.getByText(/image content is unchanged/i)).toBeInTheDocument();
  });

  it('appears when output is identical to input (0% change)', () => {
    render(<CompareStep result={makeResult({ outputSizeBytes: 100_000 })} onSave={onSave} onBack={onBack} onStartOver={onStartOver} />);
    expect(screen.getByText(/image content is unchanged/i)).toBeInTheDocument();
  });

  it('does NOT appear when reduction is 20% (meaningful compression result)', () => {
    render(<CompareStep result={makeResult()} onSave={onSave} onBack={onBack} onStartOver={onStartOver} />);
    expect(screen.queryByText(/image content is unchanged/i)).not.toBeInTheDocument();
  });

  it('does NOT appear when targetMet=false (target-not-met banner takes precedence)', () => {
    render(<CompareStep
      result={makeResult({ outputSizeBytes: 101_000, targetMet: false, bestAchievableSizeBytes: 101_000 })}
      onSave={onSave} onBack={onBack} onStartOver={onStartOver}
    />);
    expect(screen.queryByText(/image content is unchanged/i)).not.toBeInTheDocument();
  });
});

// ─── Target not met warning ───────────────────────────────────────────────────

describe('CompareStep — target not met warning', () => {
  it('shows when targetMet=false with bestAchievableSizeBytes', () => {
    render(<CompareStep
      result={makeResult({ targetMet: false, bestAchievableSizeBytes: 80_000 })}
      onSave={onSave} onBack={onBack} onStartOver={onStartOver}
    />);
    expect(screen.getByText(/target size not achievable/i)).toBeInTheDocument();
    // "best result: 78.1 KB" — check the full warning sentence is present
    expect(screen.getByText(/best result/i)).toBeInTheDocument();
  });

  it('does NOT show when targetMet=true', () => {
    render(<CompareStep result={makeResult()} onSave={onSave} onBack={onBack} onStartOver={onStartOver} />);
    expect(screen.queryByText(/target size not achievable/i)).not.toBeInTheDocument();
  });
});

// ─── Action buttons ───────────────────────────────────────────────────────────

describe('CompareStep — action buttons', () => {
  it('calls onBack when Back is clicked', async () => {
    render(<CompareStep result={makeResult()} onSave={onSave} onBack={onBack} onStartOver={onStartOver} />);
    await userEvent.click(screen.getByRole('button', { name: /^back$/i }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('calls onSave when Save… is clicked', async () => {
    render(<CompareStep result={makeResult()} onSave={onSave} onBack={onBack} onStartOver={onStartOver} />);
    await userEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(onSave).toHaveBeenCalledOnce();
  });

  it('calls onStartOver when Process another is clicked', async () => {
    render(<CompareStep result={makeResult()} onSave={onSave} onBack={onBack} onStartOver={onStartOver} />);
    await userEvent.click(screen.getByRole('button', { name: /process another/i }));
    expect(onStartOver).toHaveBeenCalledOnce();
  });
});

// ─── Zoom controls ────────────────────────────────────────────────────────────

describe('CompareStep — zoom controls', () => {
  it('starts at 100%', () => {
    render(<CompareStep result={makeResult()} onSave={onSave} onBack={onBack} onStartOver={onStartOver} />);
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('zoom-in advances to 150%', async () => {
    render(<CompareStep result={makeResult()} onSave={onSave} onBack={onBack} onStartOver={onStartOver} />);
    await userEvent.click(screen.getByRole('button', { name: /zoom in/i }));
    expect(screen.getByText('150%')).toBeInTheDocument();
  });

  it('zoom-out retreats to 75%', async () => {
    render(<CompareStep result={makeResult()} onSave={onSave} onBack={onBack} onStartOver={onStartOver} />);
    await userEvent.click(screen.getByRole('button', { name: /zoom out/i }));
    expect(screen.getByText('75%')).toBeInTheDocument();
  });

  it('zoom-out is disabled at minimum zoom (50%)', async () => {
    render(<CompareStep result={makeResult()} onSave={onSave} onBack={onBack} onStartOver={onStartOver} />);
    const zoomOut = screen.getByRole('button', { name: /zoom out/i });
    // 100% → 75% → 50% (2 clicks)
    await userEvent.click(zoomOut);
    await userEvent.click(zoomOut);
    expect(zoomOut).toBeDisabled();
  });

  it('zoom-in is disabled at maximum zoom (200%)', async () => {
    render(<CompareStep result={makeResult()} onSave={onSave} onBack={onBack} onStartOver={onStartOver} />);
    const zoomIn = screen.getByRole('button', { name: /zoom in/i });
    // 100% → 150% → 200% (2 clicks)
    await userEvent.click(zoomIn);
    await userEvent.click(zoomIn);
    expect(zoomIn).toBeDisabled();
  });
});
