// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { useEffect } from 'react';
import { ToolProvider, useToolContext } from '@/context/ToolContext';

afterEach(cleanup);

type Ctx = ReturnType<typeof useToolContext>;
let ctxRef: Ctx | null = null;

function Harness({ setup }: { setup?: (ctx: Ctx) => void }) {
  const ctx = useToolContext();
  // Runs once: the setup call is the arrange step, not something to re-run.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setup?.(ctx); }, []);
  ctxRef = ctx;
  return null;
}

function renderCtx(setup?: (ctx: Ctx) => void) {
  ctxRef = null;
  render(<ToolProvider><Harness setup={setup} /></ToolProvider>);
}

describe('ToolContext — navigation guard', () => {
  it('[TC-01] a guard can veto opening a different document', () => {
    renderCtx((ctx) => ctx.openEditor('/tmp/a.pdf'));
    act(() => { ctxRef!.setNavigationGuard(() => false); });

    act(() => { ctxRef!.openEditor('/tmp/b.pdf'); });

    // Replacing the open document discards its unsaved edits exactly as going
    // back to the dashboard does, so it has to be vetoable the same way.
    expect(ctxRef!.editorFilePath).toBe('/tmp/a.pdf');
  });

  it('[TC-02] the guard can let it through later', () => {
    renderCtx((ctx) => ctx.openEditor('/tmp/a.pdf'));

    let deferred: (() => void) | null = null;
    act(() => {
      ctxRef!.setNavigationGuard((proceed) => { deferred = proceed; return false; });
    });
    act(() => { ctxRef!.openEditor('/tmp/b.pdf'); });
    expect(ctxRef!.editorFilePath).toBe('/tmp/a.pdf');

    act(() => { deferred!(); });

    expect(ctxRef!.editorFilePath).toBe('/tmp/b.pdf');
  });

  it('[TC-03] with no guard registered, opening just works', () => {
    renderCtx();

    act(() => { ctxRef!.openEditor('/tmp/b.pdf'); });

    expect(ctxRef!.editorFilePath).toBe('/tmp/b.pdf');
  });

  it('[TC-04] the guard still covers the dashboard and tool switches', () => {
    renderCtx((ctx) => ctx.openEditor('/tmp/a.pdf'));
    act(() => { ctxRef!.setNavigationGuard(() => false); });

    act(() => { ctxRef!.goToDashboard(); });
    expect(ctxRef!.editorFilePath).toBe('/tmp/a.pdf');

    act(() => { ctxRef!.selectTool('watermark'); });
    expect(ctxRef!.activeTool).toBeNull();
  });
});

void vi;
