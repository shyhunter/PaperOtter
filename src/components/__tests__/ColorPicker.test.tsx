// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ColorPicker } from '@/components/ColorPicker';
import { COLOR_PRESETS } from '@/lib/colorPresets';

afterEach(cleanup);

describe('ColorPicker', () => {
  it('PNC-01: offers every shared preset, White among them', () => {
    render(<ColorPicker value="#000000" onChange={() => {}} />);

    for (const preset of COLOR_PRESETS) {
      expect(screen.getByRole('button', { name: preset.label })).toBeTruthy();
    }
    expect(COLOR_PRESETS.map((p) => p.hex)).toContain('#FFFFFF');
  });

  it('PNC-02: choosing a preset reports its hex', () => {
    const onChange = vi.fn();
    render(<ColorPicker value="#000000" onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'White' }));

    expect(onChange).toHaveBeenCalledWith('#FFFFFF');
  });

  it('PNC-03: marks the selected preset, and only that one', () => {
    render(<ColorPicker value="#FFFFFF" onChange={() => {}} />);

    expect(screen.getByRole('button', { name: 'White' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Black' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('PNC-04: a custom colour reports through the same callback', () => {
    const onChange = vi.fn();
    render(<ColorPicker value="#000000" onChange={onChange} />);

    const custom = screen.getByLabelText(/custom colour/i) as HTMLInputElement;
    fireEvent.input(custom, { target: { value: '#123456' } });

    expect(onChange).toHaveBeenCalledWith('#123456');
  });

  it('PNC-05: a custom value marks no preset as selected', () => {
    render(<ColorPicker value="#123456" onChange={() => {}} />);

    for (const preset of COLOR_PRESETS) {
      expect(screen.getByRole('button', { name: preset.label }).getAttribute('aria-pressed')).toBe('false');
    }
  });

  it('PNC-06: matches a preset case-insensitively', () => {
    // <input type="color"> normalises to lowercase, so #ffffff must still read as White.
    render(<ColorPicker value="#ffffff" onChange={() => {}} />);

    expect(screen.getByRole('button', { name: 'White' }).getAttribute('aria-pressed')).toBe('true');
  });
});
