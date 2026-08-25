// @vitest-environment jsdom
/**
 * The always-there app chrome: theme, About and Buy me a coffee used to live
 * only on the dashboard, so reaching any of them meant abandoning whatever tool
 * you were in.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { useEffect } from 'react';
import { ToolProvider, useToolContext } from '@/context/ToolContext';
import { AppChrome } from '@/components/AppChrome';

const open = vi.fn();
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: (...args: unknown[]) => open(...args) }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue('1.0.0') }));

afterEach(() => { cleanup(); open.mockReset(); });

type Ctx = ReturnType<typeof useToolContext>;
let ctxRef: Ctx | null = null;

function Harness({ setup }: { setup?: (ctx: Ctx) => void }) {
  const ctx = useToolContext();
  // Runs once: the setup call is the arrange step, not something to re-run.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setup?.(ctx); }, []);
  ctxRef = ctx;
  return <AppChrome />;
}

function renderChrome(setup?: (ctx: Ctx) => void) {
  ctxRef = null;
  render(
    <ToolProvider>
      <Harness setup={setup} />
    </ToolProvider>,
  );
}

describe('AppChrome', () => {
  it('[AC-01] offers theme, About and Buy me a coffee', () => {
    renderChrome();

    expect(screen.getByRole('button', { name: /about papercut/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /theme/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /coffee/i })).toBeInTheDocument();
  });

  it('[AC-02] they stay reachable once a tool is open', () => {
    renderChrome((ctx) => ctx.selectTool('watermark'));

    expect(screen.getByRole('button', { name: /about papercut/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /theme/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /coffee/i })).toBeInTheDocument();
  });

  it('[AC-03] About opens from anywhere, not just the dashboard', () => {
    renderChrome((ctx) => ctx.selectTool('watermark'));

    fireEvent.click(screen.getByRole('button', { name: /about papercut/i }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('[AC-04] no Open button on the dashboard, which is already a file picker', () => {
    renderChrome();

    expect(screen.queryByRole('button', { name: /open another/i })).toBeNull();
  });

  it('[AC-05] Open appears once there is a document to replace', () => {
    renderChrome((ctx) => ctx.openEditor('/tmp/a.pdf'));

    expect(screen.getByRole('button', { name: /open another/i })).toBeInTheDocument();
  });

  it('[AC-06] choosing a file in the editor swaps the open document', async () => {
    open.mockResolvedValue('/tmp/b.pdf');
    renderChrome((ctx) => ctx.openEditor('/tmp/a.pdf'));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /open another/i }));
    });

    expect(ctxRef!.editorFilePath).toBe('/tmp/b.pdf');
  });

  it('[AC-07] cancelling the picker leaves the current document alone', async () => {
    open.mockResolvedValue(null);
    renderChrome((ctx) => ctx.openEditor('/tmp/a.pdf'));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /open another/i }));
    });

    expect(ctxRef!.editorFilePath).toBe('/tmp/a.pdf');
  });

  it('[AC-08] inside a tool, the chosen file is handed to that tool', async () => {
    open.mockResolvedValue('/tmp/b.pdf');
    renderChrome((ctx) => ctx.selectTool('watermark'));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /open another/i }));
    });

    // Staying in the tool is the whole point -- it must not bounce to the editor.
    expect(ctxRef!.pendingFiles).toEqual(['/tmp/b.pdf']);
    expect(ctxRef!.editorFilePath).toBeNull();
    expect(ctxRef!.activeTool).toBe('watermark');
  });
});
