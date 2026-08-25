// @vitest-environment jsdom
/**
 * Ink colour for signatures. Black and blue are both ordinary on a signed
 * document, and until now only black was reachable.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { SignatureCreateStep } from '@/components/sign-pdf/SignatureCreateStep';
import { SignatureTyped } from '@/components/sign-pdf/SignatureTyped';
import { COLOR_PRESETS } from '@/lib/colorPresets';

vi.mock('@/hooks/useSavedSignatures', () => ({
  useSavedSignatures: () => ({
    signatures: [],
    isLoading: false,
    saveSignature: vi.fn(),
    deleteSignature: vi.fn(),
  }),
}));

// jsdom has no FontFaceSet; SignatureTyped preloads its script fonts through it.
Object.defineProperty(document, 'fonts', {
  configurable: true,
  value: { load: vi.fn().mockResolvedValue([]) },
});

afterEach(cleanup);

describe('SignatureTyped — ink colour', () => {
  it('[SIG-COL-01] renders the preview in the given ink', () => {
    render(<SignatureTyped onComplete={vi.fn()} color="#2563EB" />);

    fireEvent.change(screen.getByPlaceholderText(/type your name/i), { target: { value: 'Ada' } });

    const preview = screen.getByText('Ada');
    // What the preview shows has to be what the exported PNG carries, or the
    // colour choice is decoration.
    expect(preview.style.color).toBe('rgb(37, 99, 235)');
  });

  it('[SIG-COL-02] defaults to black when no ink is given', () => {
    render(<SignatureTyped onComplete={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText(/type your name/i), { target: { value: 'Ada' } });

    expect(screen.getByText('Ada').style.color).toBe('rgb(0, 0, 0)');
  });
});

describe('SignatureCreateStep — ink colour', () => {
  it('[SIG-COL-03] offers the shared colours while drawing', () => {
    render(<SignatureCreateStep onSignatureSelected={vi.fn()} onBack={vi.fn()} />);

    for (const preset of COLOR_PRESETS) {
      expect(screen.getByRole('button', { name: preset.label })).toBeInTheDocument();
    }
  });

  it('[SIG-COL-04] the ink carries across from the Draw tab to the Type tab', () => {
    render(<SignatureCreateStep onSignatureSelected={vi.fn()} onBack={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Blue' }));
    fireEvent.click(screen.getByRole('button', { name: /^Type$/i }));
    fireEvent.change(screen.getByPlaceholderText(/type your name/i), { target: { value: 'Ada' } });

    // One ink for the whole step: switching how you make the signature is not a
    // reason to lose the colour you picked for it.
    expect(screen.getByText('Ada').style.color).toBe('rgb(37, 99, 235)');
  });

  it('[SIG-COL-05] no ink picker on the Upload tab', () => {
    render(<SignatureCreateStep onSignatureSelected={vi.fn()} onBack={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /^Upload$/i }));

    // An uploaded image carries its own colours; offering ink would imply a
    // recolouring that does not happen.
    expect(screen.queryByRole('button', { name: 'Blue' })).toBeNull();
  });
});
