// @vitest-environment jsdom
/**
 * The watermark overlay: the watermark as a thing you grab, not a set of
 * numbers you type. Drag it anywhere on the page, drag its handle to resize.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { useEffect } from 'react';
import { EditorProvider, useEditorContext, createEditorViewState } from '@/context/EditorContext';
import { WatermarkOverlay } from '@/components/pdf-editor/WatermarkOverlay';
import { DEFAULT_WATERMARK_OPTIONS, type WatermarkOptions } from '@/lib/pdfWatermark';

afterEach(cleanup);

const PAGE_W = 600;
const PAGE_H = 800;

let latestDraft: WatermarkOptions | null = null;

function Harness({ draft }: { draft: WatermarkOptions | null }) {
  const ctx = useEditorContext();

  useEffect(() => {
    ctx.initState(createEditorViewState(new Uint8Array([0x25, 0x50, 0x44, 0x46]), 1, 't.pdf', '/tmp/t.pdf', 1.0));
    ctx.setWatermarkDraft(draft);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  latestDraft = ctx.state.watermarkDraft;
  return <WatermarkOverlay pageWidth={PAGE_W} pageHeight={PAGE_H} zoom={1} />;
}

function renderOverlay(draft: WatermarkOptions | null) {
  latestDraft = null;
  return render(
    <EditorProvider>
      <Harness draft={draft} />
    </EditorProvider>,
  );
}

/** Presses at (fromX, fromY), moves to (toX, toY), releases. */
function drag(el: HTMLElement, fromX: number, fromY: number, toX: number, toY: number) {
  act(() => {
    fireEvent.mouseDown(el, { clientX: fromX, clientY: fromY, button: 0 });
    fireEvent.mouseMove(document, { clientX: toX, clientY: toY });
    fireEvent.mouseUp(document);
  });
}

describe('WatermarkOverlay', () => {
  it('WMO-01: shows nothing until a watermark is being configured', () => {
    renderOverlay(null);
    expect(screen.queryByTestId('watermark-overlay')).toBeNull();
  });

  it('WMO-02: shows nothing while the text is empty', () => {
    renderOverlay({ ...DEFAULT_WATERMARK_OPTIONS, text: '   ' });
    expect(screen.queryByTestId('watermark-overlay')).toBeNull();
  });

  it('WMO-03: renders the draft text, centred by default', () => {
    renderOverlay({ ...DEFAULT_WATERMARK_OPTIONS, text: 'DRAFT' });

    const el = screen.getByTestId('watermark-overlay');
    expect(el.textContent).toBe('DRAFT');
    // centerY is measured from the bottom as PDF coordinates are; CSS top runs
    // the other way, so the centre is the one point where they agree.
    expect(el.style.left).toBe('300px');
    expect(el.style.top).toBe('400px');
  });

  it('WMO-04: dragging moves it, reported as a fraction of the page', () => {
    renderOverlay({ ...DEFAULT_WATERMARK_OPTIONS, text: 'DRAFT' });

    // 60px right and 80px down on a 600x800 page: a tenth of each.
    drag(screen.getByTestId('watermark-overlay'), 300, 400, 360, 480);

    expect(latestDraft?.centerX).toBeCloseTo(0.6, 5);
    // Down in CSS is down in the page, which is *less* Y in PDF coordinates.
    expect(latestDraft?.centerY).toBeCloseTo(0.4, 5);
  });

  it('WMO-05: dragging accounts for zoom', () => {
    render(
      <EditorProvider>
        <ZoomedHarness />
      </EditorProvider>,
    );

    // 120 screen px at 2x zoom is 60 page px — a tenth of a 600px-wide page.
    drag(screen.getByTestId('watermark-overlay'), 600, 800, 720, 800);

    expect(latestDraft?.centerX).toBeCloseTo(0.6, 5);
  });

  it('WMO-06: cannot be dragged off the page', () => {
    renderOverlay({ ...DEFAULT_WATERMARK_OPTIONS, text: 'DRAFT' });

    drag(screen.getByTestId('watermark-overlay'), 300, 400, 5000, -5000);

    expect(latestDraft?.centerX).toBe(1);
    expect(latestDraft?.centerY).toBe(1);
  });

  it('WMO-07: the handle resizes the text without moving it', () => {
    renderOverlay({ ...DEFAULT_WATERMARK_OPTIONS, text: 'DRAFT', fontSize: 48 });

    const before = latestDraft;
    drag(screen.getByTestId('watermark-resize-handle'), 340, 440, 400, 500);

    expect(latestDraft!.fontSize).toBeGreaterThan(48);
    expect(latestDraft!.centerX).toBe(before!.centerX);
    expect(latestDraft!.centerY).toBe(before!.centerY);
  });

  it('WMO-08: dragging the handle inward shrinks the text', () => {
    renderOverlay({ ...DEFAULT_WATERMARK_OPTIONS, text: 'DRAFT', fontSize: 48 });

    drag(screen.getByTestId('watermark-resize-handle'), 340, 440, 310, 410);

    expect(latestDraft!.fontSize).toBeLessThan(48);
  });

  it('WMO-09: the text can never be shrunk to nothing or blown up past the page', () => {
    renderOverlay({ ...DEFAULT_WATERMARK_OPTIONS, text: 'DRAFT', fontSize: 48 });

    drag(screen.getByTestId('watermark-resize-handle'), 340, 440, 300, 400);
    expect(latestDraft!.fontSize).toBeGreaterThanOrEqual(8);

    drag(screen.getByTestId('watermark-resize-handle'), 340, 440, 9000, 9000);
    expect(latestDraft!.fontSize).toBeLessThanOrEqual(200);
  });

  it('WMO-11: the rotate handle turns it', () => {
    renderOverlay({ ...DEFAULT_WATERMARK_OPTIONS, text: 'DRAFT', rotation: -45 });

    // The handle sits 40px straight above the centre (300, 400). Swinging the
    // pointer from there round to due east is a quarter turn clockwise.
    drag(screen.getByTestId('watermark-rotate-handle'), 300, 360, 340, 400);

    expect(latestDraft!.rotation).toBeCloseTo(-135, 4);
  });

  it('WMO-12: rotating neither moves nor resizes it', () => {
    renderOverlay({ ...DEFAULT_WATERMARK_OPTIONS, text: 'DRAFT', fontSize: 48 });

    const before = latestDraft;
    drag(screen.getByTestId('watermark-rotate-handle'), 300, 360, 340, 400);

    expect(latestDraft!.centerX).toBe(before!.centerX);
    expect(latestDraft!.centerY).toBe(before!.centerY);
    expect(latestDraft!.fontSize).toBe(before!.fontSize);
  });

  it('WMO-13: rotation stays inside the range the sidebar field accepts', () => {
    renderOverlay({ ...DEFAULT_WATERMARK_OPTIONS, text: 'DRAFT', rotation: -45 });

    // Half a turn from straight up puts the raw sum at -225.
    drag(screen.getByTestId('watermark-rotate-handle'), 300, 360, 300, 440);

    expect(latestDraft!.rotation).toBeCloseTo(135, 4);
    expect(latestDraft!.rotation).toBeGreaterThan(-180);
    expect(latestDraft!.rotation).toBeLessThanOrEqual(180);
  });

  it('WMO-14: holding Shift snaps to 15 degrees', () => {
    renderOverlay({ ...DEFAULT_WATERMARK_OPTIONS, text: 'DRAFT', rotation: -45 });

    // Free rotation would land on about -120.96 here.
    act(() => {
      const el = screen.getByTestId('watermark-rotate-handle');
      fireEvent.mouseDown(el, { clientX: 300, clientY: 360, button: 0 });
      fireEvent.mouseMove(document, { clientX: 340, clientY: 390, shiftKey: true });
      fireEvent.mouseUp(document);
    });

    expect(latestDraft!.rotation).toBe(-120);
  });

  it('WMO-10: a plain click does not nudge it', () => {
    renderOverlay({ ...DEFAULT_WATERMARK_OPTIONS, text: 'DRAFT' });

    const before = latestDraft;
    drag(screen.getByTestId('watermark-overlay'), 300, 400, 300, 400);

    expect(latestDraft!.centerX).toBe(before!.centerX);
    expect(latestDraft!.centerY).toBe(before!.centerY);
  });
});

function ZoomedHarness() {
  const ctx = useEditorContext();
  useEffect(() => {
    ctx.initState(createEditorViewState(new Uint8Array([0x25, 0x50, 0x44, 0x46]), 1, 't.pdf', '/tmp/t.pdf', 1.0));
    ctx.setWatermarkDraft({ ...DEFAULT_WATERMARK_OPTIONS, text: 'DRAFT' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  latestDraft = ctx.state.watermarkDraft;
  return <WatermarkOverlay pageWidth={PAGE_W} pageHeight={PAGE_H} zoom={2} />;
}
