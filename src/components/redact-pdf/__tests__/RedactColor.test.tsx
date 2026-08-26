// @vitest-environment jsdom
/**
 * The redaction box colour: chosen in the step, carried through to the
 * flattening that actually destroys the content.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { RedactStep } from '@/components/redact-pdf/RedactStep';
import { colorPresets } from '@/lib/colorPresets';

vi.mock('pdfjs-dist', () => ({
  getDocument: vi.fn().mockReturnValue({
    promise: Promise.resolve({
      numPages: 1,
      getPage: vi.fn().mockResolvedValue({
        getViewport: vi.fn().mockReturnValue({ width: 612, height: 792 }),
        render: vi.fn().mockReturnValue({ promise: Promise.resolve() }),
        getTextContent: vi.fn().mockResolvedValue({ items: [] }),
      }),
      destroy: vi.fn(),
    }),
  }),
  GlobalWorkerOptions: { workerSrc: '' },
}));

afterEach(cleanup);

function renderStep() {
  const onComplete = vi.fn();
  render(
    <RedactStep
      pdfBytes={new Uint8Array([0x25, 0x50, 0x44, 0x46])}
      onComplete={onComplete}
      onBack={vi.fn()}
    />,
  );
  return onComplete;
}

describe('RedactStep — box colour', () => {
  it('[RDC-01] offers the same colours as every other feature', () => {
    renderStep();

    for (const preset of colorPresets()) {
      expect(screen.getByRole('button', { name: preset.label })).toBeInTheDocument();
    }
  });

  it('[RDC-02] starts on black, which is what redactions were before', () => {
    renderStep();

    expect(screen.getByRole('button', { name: 'Black' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('[RDC-03] a chosen colour becomes the selected one', () => {
    renderStep();

    fireEvent.click(screen.getByRole('button', { name: 'Blue' }));

    expect(screen.getByRole('button', { name: 'Blue' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Black' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('[RDC-04] warns when the box would be invisible on a white page', () => {
    renderStep();

    expect(screen.queryByText(/hard to see/i)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'White' }));

    // The content underneath is destroyed either way -- this is about the reader
    // being able to tell that anything was removed at all.
    expect(screen.getByText(/hard to see/i)).toBeInTheDocument();
  });
});
