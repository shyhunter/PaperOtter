// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LandingCard } from '@/components/LandingCard';

afterEach(cleanup);

// ─── Helpers ──────────────────────────────────────────────────────────────────

const onPickerClick = vi.fn();
const onCorruptPdfDismiss = vi.fn();
const onCorruptPdfRepair = vi.fn();

function baseProps() {
  return {
    dragState: 'idle' as const,
    isLoading: false,
    onPickerClick,
    corruptPdfBlock: null as null | { name: string },
    onCorruptPdfDismiss,
    onCorruptPdfRepair,
  };
}

// ─── Phase D: Corrupt PDF hard block modal ─────────────────────────────────────

describe('LandingCard — corrupt PDF hard block modal (Phase D)', () => {
  it('[COR-02] shows modal when corruptPdfBlock is set', () => {
    render(<LandingCard {...baseProps()} corruptPdfBlock={{ name: 'broken.pdf' }} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/damaged or invalid pdf/i)).toBeInTheDocument();
  });

  it('[COR-02b] modal displays the corrupt file name', () => {
    render(<LandingCard {...baseProps()} corruptPdfBlock={{ name: 'my-report.pdf' }} />);
    expect(screen.getByText(/my-report\.pdf/i)).toBeInTheDocument();
  });

  it('[COR-02c] modal has "Repair with Repair PDF" button', () => {
    render(<LandingCard {...baseProps()} corruptPdfBlock={{ name: 'broken.pdf' }} />);
    expect(screen.getByRole('button', { name: /repair with repair pdf/i })).toBeInTheDocument();
  });

  it('[COR-02d] "Repair with Repair PDF" button calls onCorruptPdfRepair', async () => {
    render(<LandingCard {...baseProps()} corruptPdfBlock={{ name: 'broken.pdf' }} />);
    await userEvent.click(screen.getByRole('button', { name: /repair with repair pdf/i }));
    expect(onCorruptPdfRepair).toHaveBeenCalledOnce();
  });

  it('[COR-02e] "Pick a Different File" button calls onCorruptPdfDismiss', async () => {
    render(<LandingCard {...baseProps()} corruptPdfBlock={{ name: 'broken.pdf' }} />);
    await userEvent.click(screen.getByRole('button', { name: /pick a different file/i }));
    expect(onCorruptPdfDismiss).toHaveBeenCalledOnce();
  });

  it('[COR-02f] modal is NOT shown when corruptPdfBlock is null', () => {
    render(<LandingCard {...baseProps()} corruptPdfBlock={null} />);
    expect(screen.queryByRole('dialog', { name: /damaged/i })).not.toBeInTheDocument();
  });
});
