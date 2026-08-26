// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ToolDefinition } from '@/types/tools';
import { ToolCard } from '@/components/Dashboard';

// LazyStore (useRecentDirs/useFavourites) — must be a real class (module-level `new LazyStore()`)
vi.mock('@tauri-apps/plugin-store', () => ({
  LazyStore: class {
    get() { return Promise.resolve(null); }
    set() { return Promise.resolve(undefined); }
    save() { return Promise.resolve(undefined); }
  },
}));

vi.mock('@tauri-apps/api/webview', () => ({
  getCurrentWebview: vi.fn(() => ({
    onDragDropEvent: vi.fn(() => Promise.resolve(() => {})),
  })),
}));

const tool: ToolDefinition = {
  id: 'compress-pdf',
  name: 'tool.compressPdf.name',
  description: 'tool.compressPdf.desc',
  category: 'pdf',
  icon: 'FileDown',
  acceptsFormats: ['pdf'],
  steps: [],
};

// Bug: favoriting a tool from the main grid left its card's star permanently
// yellow/visible there too, duplicating the "My Favourites" section's indicator
// and reading as confusing. The main grid card should go back to the neutral
// hover-reveal star regardless of favourite state — only the Favourites section
// shows the persistent yellow star.
afterEach(cleanup);

describe('ToolCard favourite star', () => {
  it('does not render a permanently filled star when the tool is a favourite', () => {
    render(
      <ToolCard tool={tool} onClick={() => {}} isFavorite onToggleFavorite={() => {}} />
    );

    const star = screen.getByTitle('Remove from favourites').querySelector('svg');
    expect(star?.getAttribute('class')).not.toMatch(/fill-yellow-500/);
  });

  it('still toggles favourite state on click regardless of visual style', async () => {
    const onToggleFavorite = vi.fn();
    render(
      <ToolCard tool={tool} onClick={() => {}} isFavorite onToggleFavorite={onToggleFavorite} />
    );

    await userEvent.click(screen.getByTitle('Remove from favourites'));
    expect(onToggleFavorite).toHaveBeenCalledTimes(1);
  });
});
