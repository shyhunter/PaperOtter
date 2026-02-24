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
    imageCount: 0,
    compressibilityScore: 0,
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
//   inputSizeBytes = 100,000 → formatBytes → "97.7 KB"
//   outputSizeBytes = 80,000 → formatBytes → "78.1 KB"
//   New format: "97.7 KB → 78.1 KB (20% smaller)"

// ─── Stats bar ────────────────────────────────────────────────────────────────

describe('CompareStep — stats bar', () => {
  it('shows X → Y format with percentage when output is smaller', () => {
    render(<CompareStep result={makeResult()} onSave={onSave} onBack={onBack} onStartOver={onStartOver} />);
    // 100,000 bytes → 97.7 KB, 80,000 bytes → 78.1 KB, 20% smaller
    expect(screen.getByText(/97\.7 KB → 78\.1 KB/)).toBeInTheDocument();
    expect(screen.getByText(/20% smaller/)).toBeInTheDocument();
  });

  it('shows X → Y format with "larger" when output is bigger', () => {
    // 110,000 bytes → 107.4 KB, 100,000 bytes → 97.7 KB
    render(<CompareStep result={makeResult({ outputSizeBytes: 110_000 })} onSave={onSave} onBack={onBack} onStartOver={onStartOver} />);
    expect(screen.getByText(/97\.7 KB → 107\.4 KB/)).toBeInTheDocument();
    expect(screen.getByText(/10% larger/)).toBeInTheDocument();
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

// ─── Structural-only notice (removed — must NOT appear) ───────────────────────
// The structural notice "image content is unchanged" has been removed from CompareStep.
// These tests ensure it is never accidentally re-introduced.

describe('CompareStep — structural-only notice must not appear', () => {
  it('does NOT appear when size delta is within 2%', () => {
    render(<CompareStep result={makeResult({ outputSizeBytes: 101_000 })} onSave={onSave} onBack={onBack} onStartOver={onStartOver} />);
    expect(screen.queryByText(/image content is unchanged/i)).not.toBeInTheDocument();
  });

  it('does NOT appear when output is identical to input (0% change)', () => {
    render(<CompareStep result={makeResult({ outputSizeBytes: 100_000 })} onSave={onSave} onBack={onBack} onStartOver={onStartOver} />);
    expect(screen.queryByText(/image content is unchanged/i)).not.toBeInTheDocument();
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
