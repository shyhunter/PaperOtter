// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ToolCard } from '@/components/Dashboard';
import type { ToolDefinition } from '@/types/tools';

// ─── Tool card sizing (UI-01) ────────────────────────────────────────────────
//
// The cards sit in a CSS grid, which stretches each cell to the tallest in the
// row. The wrapper stretched but the button inside did not, so a tool whose
// description wraps to one line rendered a visibly shorter card than one that
// wraps to two — and descriptions range from 29 to 56 characters.
//
// jsdom computes no CSS, so this asserts the classes that make the button fill
// its cell rather than the resulting pixels. TEST_PLAN records that no test in
// this suite can measure layout.

vi.mock('@tauri-apps/plugin-store', () => ({
  LazyStore: class { get() { return Promise.resolve(null); } set() { return Promise.resolve(); } save() { return Promise.resolve(); } },
}));
vi.mock('@tauri-apps/api/webview', () => ({
  getCurrentWebview: vi.fn(() => ({ onDragDropEvent: vi.fn(() => Promise.resolve(() => {})) })),
}));

const tool = (over: Partial<ToolDefinition> = {}): ToolDefinition => ({
  id: 'compress-pdf',
  name: 'tool.compressPdf.name',
  description: 'tool.compressPdf.desc',
  category: 'pdf',
  icon: 'FileDown',
  acceptsFormats: ['pdf'],
  steps: [],
  ...over,
});

afterEach(cleanup);

describe('ToolCard', () => {
  it('[UI-01a] fills the height of its grid cell', () => {
    const { container } = render(<ToolCard tool={tool()} onClick={vi.fn()} />);
    const wrapper = container.firstElementChild!;
    const button = screen.getByRole('button');

    // Both are needed: the grid stretches the wrapper, the wrapper must pass
    // that height on to the button, or the card floats short inside its cell.
    expect(wrapper.className).toContain('h-full');
    expect(button.className).toContain('h-full');
  });

  it('[UI-01b] is the same height whether its description wraps or not', () => {
    // Same structural guarantee for a short and a long description: neither
    // gets to define its own height.
    const short = render(<ToolCard tool={tool({ description: 'tool.pageNumbers.desc' })} onClick={vi.fn()} />);
    const shortButton = short.container.querySelector('button')!.className;
    cleanup();
    const long = render(<ToolCard tool={tool({ description: 'tool.ocrPdf.desc' })} onClick={vi.fn()} />);
    const longButton = long.container.querySelector('button')!.className;

    expect(shortButton).toBe(longButton);
    expect(longButton).toContain('h-full');
  });

  it('[UI-01c] keeps the icon and title anchored to the top', () => {
    // With a fixed height, content that centres itself drifts as the row grows.
    const { container } = render(<ToolCard tool={tool()} onClick={vi.fn()} />);
    expect(container.querySelector('button')!.className).toContain('justify-start');
  });
});
