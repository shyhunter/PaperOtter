// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { BuyMeACoffeeButton } from '@/components/BuyMeACoffeeButton';

vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn(() => Promise.resolve()) }));

afterEach(cleanup);

describe('BuyMeACoffeeButton', () => {
  it('BMC-01: renders a Buy me a coffee button', () => {
    render(<BuyMeACoffeeButton />);
    expect(screen.getByRole('button', { name: /buy me a coffee/i })).toBeInTheDocument();
  });

  it('BMC-02: clicking opens the Buy Me a Coffee URL', () => {
    render(<BuyMeACoffeeButton />);
    fireEvent.click(screen.getByRole('button', { name: /buy me a coffee/i }));
    expect(openUrl).toHaveBeenCalledWith('https://buymeacoffee.com/shyhunter');
  });
});
