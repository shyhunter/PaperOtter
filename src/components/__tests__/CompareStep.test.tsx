// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CompareStep } from '@/components/CompareStep';
import { openPdfForLazyRender } from '@/lib/pdfThumbnail';
import type { PdfProcessingResult } from '@/types/file';

afterEach(cleanup);

// Mock pdfThumbnail — PDF.js requires canvas + worker, unavailable in jsdom.
// Component tests verify UI rendering and interaction only, with a zero-page
// handle (matching the old renderAllPdfPages([]) mock's behavior).
vi.mock('@/lib/pdfThumbnail', () => ({
  openPdfForLazyRender: vi.fn().mockResolvedValue({
    numPages: 0,
    pageAspectRatios: [],
    renderPage: vi.fn().mockResolvedValue(''),
    destroy: vi.fn(),
  }),
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
    wasAlreadyOptimal: false,
    imageCount: 0,
    compressibilityScore: 0,
    jpxByteShare: 0,
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
    const statsBar = screen.getByTestId('stats-bar');
    expect(statsBar).toHaveTextContent('97.7 KB');
    expect(statsBar).toHaveTextContent('78.1 KB');
    expect(screen.getByText(/20% smaller/)).toBeInTheDocument();
  });

  it('shows X → Y format with "larger" when output is bigger', () => {
    // 110,000 bytes → 107.4 KB, 100,000 bytes → 97.7 KB
    render(<CompareStep result={makeResult({ outputSizeBytes: 110_000 })} onSave={onSave} onBack={onBack} onStartOver={onStartOver} />);
    const statsBar = screen.getByTestId('stats-bar');
    expect(statsBar).toHaveTextContent('97.7 KB');
    expect(statsBar).toHaveTextContent('107.4 KB');
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

  it('calls onStartOver when Start Over is clicked', async () => {
    render(<CompareStep result={makeResult()} onSave={onSave} onBack={onBack} onStartOver={onStartOver} />);
    await userEvent.click(screen.getByRole('button', { name: /start over/i }));
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

// ─── BUG-01 regression: wasAlreadyOptimal ────────────────────────────────────
// When GS inflated a text-only PDF and processPdf reverted to source bytes,
// CompareStep must show the "already optimal" notice — not a "205% larger" label.

describe('CompareStep — BUG-01 regression (wasAlreadyOptimal messaging)', () => {
  it('[BUG-01-UI] shows already-optimal notice when wasAlreadyOptimal=true', () => {
    render(<CompareStep
      result={makeResult({ wasAlreadyOptimal: true, outputSizeBytes: 100_000 })}
      onSave={onSave} onBack={onBack} onStartOver={onStartOver}
    />);
    // "already optimal" notice must appear
    expect(screen.getByText(/already optim/i)).toBeInTheDocument();
    // No "larger" label — the file was NOT made larger from the user's perspective
    expect(screen.queryByText(/larger/i)).not.toBeInTheDocument();
  });

  it('[BUG-01-UI-b] target-not-met banner says "already at maximum compression" when wasAlreadyOptimal=true', () => {
    render(<CompareStep
      result={makeResult({ wasAlreadyOptimal: true, targetMet: false, bestAchievableSizeBytes: 100_000 })}
      onSave={onSave} onBack={onBack} onStartOver={onStartOver}
    />);
    expect(screen.getByText(/already at maximum compression/i)).toBeInTheDocument();
  });

  // Bug: a real-world PDF whose images were JPEG2000-encoded showed "File already
  // optimal" at every quality level, including the most aggressive one — Ghostscript
  // genuinely can't re-encode JPXDecode-filtered images, so the generic message was
  // misleading. When the pre-scan detects JPX images, explain the real reason instead.
  it('[JPX-01] stats bar explains JPEG2000 when wasAlreadyOptimal=true and jpxByteShare is high', () => {
    render(<CompareStep
      result={makeResult({
        wasAlreadyOptimal: true, outputSizeBytes: 100_000, imageCount: 5, compressibilityScore: 0.5, jpxByteShare: 1,
      })}
      onSave={onSave} onBack={onBack} onStartOver={onStartOver}
    />);
    expect(screen.getByText(/already jpeg2000-encoded/i)).toBeInTheDocument();
    expect(screen.queryByText(/^File already optimal$/)).not.toBeInTheDocument();
  });

  it('[JPX-02] target-not-met banner explains JPEG2000 when wasAlreadyOptimal=true and jpxByteShare is high', () => {
    render(<CompareStep
      result={makeResult({
        wasAlreadyOptimal: true, targetMet: false, bestAchievableSizeBytes: 100_000,
        imageCount: 5, compressibilityScore: 0.5, jpxByteShare: 1,
      })}
      onSave={onSave} onBack={onBack} onStartOver={onStartOver}
    />);
    const banner = within(screen.getByTestId('target-not-met-banner'));
    expect(banner.getByText(/jpeg2000-encoded/i)).toBeInTheDocument();
    expect(banner.queryByText(/already at maximum compression for all quality settings/i)).not.toBeInTheDocument();
  });
});

// ─── Phase E: recovery button and updated "already optimal" message ───────────

describe('CompareStep — Phase E: recovery CTA and message update', () => {
  it('[CMP-BACK-01] shows "Back and try again" button in target-not-met banner', () => {
    render(<CompareStep
      result={makeResult({ targetMet: false, bestAchievableSizeBytes: 80_000 })}
      onSave={onSave} onBack={onBack} onStartOver={onStartOver}
    />);
    expect(screen.getByRole('button', { name: /back and try again/i })).toBeInTheDocument();
  });

  it('[CMP-BACK-01b] "Back and try again" button calls onBack', async () => {
    render(<CompareStep
      result={makeResult({ targetMet: false, bestAchievableSizeBytes: 80_000 })}
      onSave={onSave} onBack={onBack} onStartOver={onStartOver}
    />);
    await userEvent.click(screen.getByRole('button', { name: /back and try again/i }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('[CMP-MSG-01] wasAlreadyOptimal shows updated message (not "fully optimised")', () => {
    render(<CompareStep
      result={makeResult({ wasAlreadyOptimal: true, targetMet: false, bestAchievableSizeBytes: 100_000 })}
      onSave={onSave} onBack={onBack} onStartOver={onStartOver}
    />);
    expect(screen.getByText(/already at maximum compression for all quality settings/i)).toBeInTheDocument();
    expect(screen.queryByText(/fully optimis/i)).not.toBeInTheDocument();
  });
});

// ─── Lazy page rendering ──────────────────────────────────────────────────────
//
// Bug: CompareStep rendered every page of the document (both Before and After
// panels) synchronously up front via renderAllPdfPages, regardless of how many
// pages were actually visible. For a real-world 256-page PDF this made Generate
// Preview extremely slow and memory-heavy. Pages are now rendered on demand as
// they approach the viewport (via IntersectionObserver) and evicted once they
// leave it, so cost and memory stay bounded regardless of document size.

class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  observed: Element[] = [];
  callback: IntersectionObserverCallback;

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    FakeIntersectionObserver.instances.push(this);
  }
  observe(el: Element) { this.observed.push(el); }
  unobserve() {}
  disconnect() {}
  trigger(target: Element, isIntersecting: boolean) {
    this.callback(
      [{ target, isIntersecting } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
}

describe('CompareStep — lazy page rendering', () => {
  let originalIO: typeof IntersectionObserver | undefined;

  beforeEach(() => {
    FakeIntersectionObserver.instances = [];
    originalIO = globalThis.IntersectionObserver;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).IntersectionObserver = FakeIntersectionObserver;
  });

  afterEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).IntersectionObserver = originalIO;
  });

  function findObserverFor(el: Element): FakeIntersectionObserver {
    const observer = FakeIntersectionObserver.instances.find((o) => o.observed.includes(el));
    if (!observer) throw new Error('No observer found for element');
    return observer;
  }

  it('[LAZY-01] does not render any page before it intersects the viewport', async () => {
    const renderPage = vi.fn().mockResolvedValue('data:image/png;base64,AAA');
    vi.mocked(openPdfForLazyRender).mockResolvedValue({
      numPages: 5,
      pageAspectRatios: [1.4, 1.4, 1.4, 1.4, 1.4],
      renderPage,
      destroy: vi.fn(),
    });

    render(<CompareStep result={makeResult({ pageCount: 5 })} onSave={onSave} onBack={onBack} onStartOver={onStartOver} />);
    await waitFor(() => expect(FakeIntersectionObserver.instances.length).toBeGreaterThan(0));

    expect(renderPage).not.toHaveBeenCalled();
  });

  it('[LAZY-02] renders a page once it intersects the viewport', async () => {
    const renderPage = vi.fn().mockResolvedValue('data:image/png;base64,AAA');
    vi.mocked(openPdfForLazyRender).mockResolvedValue({
      numPages: 3,
      pageAspectRatios: [1.4, 1.4, 1.4],
      renderPage,
      destroy: vi.fn(),
    });

    const { container } = render(
      <CompareStep result={makeResult({ pageCount: 3 })} onSave={onSave} onBack={onBack} onStartOver={onStartOver} />,
    );
    await waitFor(() => expect(FakeIntersectionObserver.instances.length).toBeGreaterThan(0));

    const page0 = container.querySelector('[data-page-index="0"]')!;
    const observer = findObserverFor(page0);
    observer.trigger(page0, true);

    await waitFor(() => expect(renderPage).toHaveBeenCalledWith(0, expect.any(Number)));
    await waitFor(() => expect(screen.getAllByAltText(/page 1/).length).toBeGreaterThan(0));
  });

  it('[LAZY-03] evicts a rendered page once it leaves the viewport', async () => {
    const renderPage = vi.fn().mockResolvedValue('data:image/png;base64,AAA');
    vi.mocked(openPdfForLazyRender).mockResolvedValue({
      numPages: 3,
      pageAspectRatios: [1.4, 1.4, 1.4],
      renderPage,
      destroy: vi.fn(),
    });

    const { container } = render(
      <CompareStep result={makeResult({ pageCount: 3 })} onSave={onSave} onBack={onBack} onStartOver={onStartOver} />,
    );
    await waitFor(() => expect(FakeIntersectionObserver.instances.length).toBeGreaterThan(0));

    const page0 = container.querySelector('[data-page-index="0"]')!;
    const observer = findObserverFor(page0);

    observer.trigger(page0, true);
    await waitFor(() => expect(screen.getAllByAltText(/page 1/).length).toBeGreaterThan(0));

    observer.trigger(page0, false);
    await waitFor(() => expect(screen.queryByAltText(/page 1/)).not.toBeInTheDocument());
  });
});
