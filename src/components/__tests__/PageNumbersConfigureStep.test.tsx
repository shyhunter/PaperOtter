// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PageNumbersConfigureStep } from '@/components/page-numbers/PageNumbersConfigureStep';

// Real fixture per P007 — the step renders a live preview from these bytes.
const fixture = new Uint8Array(readFileSync(resolve(process.cwd(), 'test-fixtures/sample.pdf')));

vi.mock('@/lib/pdfThumbnail', () => ({ renderAllPdfPages: vi.fn().mockResolvedValue([]) }));
Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:fake'), writable: true });
Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), writable: true });

afterEach(cleanup);

function renderStep(onApply = vi.fn()) {
  render(
    <PageNumbersConfigureStep
      pdfBytes={fixture}
      pageCount={3}
      onApply={onApply}
      onBack={() => {}}
      isProcessing={false}
      error={null}
    />,
  );
  return onApply;
}

describe('PageNumbersConfigureStep — colour', () => {
  it('PNS-01: offers the colour control', () => {
    renderStep();
    expect(screen.getByRole('button', { name: 'White' })).toBeTruthy();
  });

  it('PNS-02: applies with black by default, preserving the previous behaviour', () => {
    const onApply = renderStep();

    fireEvent.click(screen.getByRole('button', { name: /apply page numbers/i }));

    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ color: '#000000' }));
  });

  it('PNS-03: applies with the chosen colour', () => {
    const onApply = renderStep();

    fireEvent.click(screen.getByRole('button', { name: 'White' }));
    fireEvent.click(screen.getByRole('button', { name: /apply page numbers/i }));

    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ color: '#FFFFFF' }));
  });
});
