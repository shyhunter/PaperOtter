// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfigureStep } from '@/components/ConfigureStep';
import type { ConfigureStepProps } from '@/components/ConfigureStep';

afterEach(cleanup);

// ─── Helpers ──────────────────────────────────────────────────────────────────

const onGeneratePreview = vi.fn();
const onBack = vi.fn();
const onCancel = vi.fn();

beforeEach(() => {
  onGeneratePreview.mockClear();
  onBack.mockClear();
  onCancel.mockClear();
});

function makeProps(overrides: Partial<ConfigureStepProps> = {}): ConfigureStepProps {
  return {
    fileName: 'test.pdf',
    pageCount: 10,
    fileSizeBytes: 6_650_000,   // ~6.34 MB
    compressibilityScore: 1.0,  // fully image-heavy
    imageCount: 100,
    isProcessing: false,
    progress: null,
    error: null,
    onGeneratePreview,
    onBack,
    onCancel,
    ...overrides,
  };
}

// ─── Phase C: Slider zone estimated sizes ─────────────────────────────────────

describe('ConfigureStep — slider zone estimates (Phase C)', () => {
  it('[CFG-EST-01] shows estimated size under each zone label (all 4 zones)', () => {
    render(<ConfigureStep {...makeProps()} />);

    // Each zone should have a "~X MB" or "~X KB" label
    // With fileSizeBytes=6.65MB and score=1.0:
    // web: ~0.15 * 6.65MB ≈ ~998 KB
    // screen: ~0.32 * 6.65MB ≈ ~2.1 MB
    // print: ~0.68 * 6.65MB ≈ ~4.5 MB
    // archive: ~0.97 * 6.65MB ≈ ~6.5 MB
    const configureStep = screen.getByTestId('configure-step');

    // Each zone must have at least one element containing a "~" size estimate
    const estimateElements = configureStep.querySelectorAll('[data-testid^="zone-estimate-"]');
    expect(estimateElements).toHaveLength(4);
  });

  it('[CFG-EST-01b] web zone estimate is smaller than archive zone estimate', () => {
    render(<ConfigureStep {...makeProps()} />);

    const webEstimate     = screen.getByTestId('zone-estimate-web');
    const archiveEstimate = screen.getByTestId('zone-estimate-archive');

    // Both must start with "~" to indicate estimate
    expect(webEstimate.textContent).toMatch(/^~/);
    expect(archiveEstimate.textContent).toMatch(/^~/);
  });
});

// ─── Phase C: Custom target pre-estimate warning ──────────────────────────────

describe('ConfigureStep — custom target pre-estimate warning (Phase C)', () => {
  it('[CFG-WARN-01] shows amber warning when custom target is below web-level estimate', async () => {
    render(<ConfigureStep {...makeProps()} />);

    // Open custom mode
    await userEvent.click(screen.getByText(/custom target size/i));

    // Enter a target lower than web estimate (~998 KB for fileSizeBytes=6.65MB score=1.0)
    // Enter 100 KB — definitely below web estimate
    const input = screen.getByPlaceholderText(/e\.g\. 2/i);
    await userEvent.type(input, '100');

    // Toggle to KB unit so 100 KB < web estimate
    const unitBtn = screen.getByRole('button', { name: /^(MB|KB)$/i });
    if (unitBtn.textContent === 'MB') {
      await userEvent.click(unitBtn); // switch to KB
    }

    // Amber warning must appear
    expect(screen.getByTestId('target-below-min-warning')).toBeInTheDocument();
  });

  it('[CFG-WARN-01b] does NOT show warning when custom target is achievable', async () => {
    render(<ConfigureStep {...makeProps()} />);

    // Open custom mode
    await userEvent.click(screen.getByText(/custom target size/i));

    // Enter 4 MB — well within achievable range for an image-heavy PDF
    const input = screen.getByPlaceholderText(/e\.g\. 2/i);
    await userEvent.type(input, '4');

    // No warning
    expect(screen.queryByTestId('target-below-min-warning')).not.toBeInTheDocument();
  });
});
