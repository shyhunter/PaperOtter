// @vitest-environment jsdom
/**
 * Metadata stripping is tied to saving, not to compressing.
 *
 * It lived as a checkbox inside the Compress panel, where nobody looking for
 * privacy would ever find it, and where it applied only if you happened to be
 * compressing. What it actually governs is what leaves the machine.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { useEffect, useRef } from 'react';
import { writeFile } from '@tauri-apps/plugin-fs';
import { EditorProvider, useEditorContext, createEditorViewState } from '@/context/EditorContext';
import { useSaveActions } from '@/components/pdf-editor/SaveController';
import { stripPdfMetadata } from '@/lib/pdfMetadata';

const EDITED = new Uint8Array([1, 2, 3, 4]);
const STRIPPED = new Uint8Array([9, 9, 9, 9]);

vi.mock('@/lib/pdfMetadata', () => ({
  stripPdfMetadata: vi.fn(async () => STRIPPED),
}));

vi.mock('@/lib/pdfEditor', () => ({
  applyAllEdits: vi.fn(async (bytes: Uint8Array) => bytes),
}));

function Harness({ strip }: { strip: boolean }) {
  const ctx = useEditorContext();
  const { save } = useSaveActions();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    ctx.initState(createEditorViewState(EDITED, 1, 'sample.pdf', '/tmp/sample.pdf', 1));
    ctx.setStripMetadataOnSave(strip);
  }, [ctx, strip]);

  return <button type="button" onClick={() => void save()}>Save now</button>;
}

function renderHarness(strip: boolean) {
  render(
    <EditorProvider>
      <Harness strip={strip} />
    </EditorProvider>,
  );
}

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('removing metadata on save', () => {
  it('SV-01: enabled, the bytes written to disk are the stripped ones', async () => {
    renderHarness(true);

    fireEvent.click(screen.getByRole('button', { name: 'Save now' }));

    await waitFor(() => expect(writeFile).toHaveBeenCalled());
    expect(stripPdfMetadata).toHaveBeenCalled();
    expect(vi.mocked(writeFile).mock.calls[0][1]).toEqual(STRIPPED);
  });

  it('SV-02: disabled, the document is written untouched', async () => {
    renderHarness(false);

    fireEvent.click(screen.getByRole('button', { name: 'Save now' }));

    await waitFor(() => expect(writeFile).toHaveBeenCalled());
    expect(stripPdfMetadata).not.toHaveBeenCalled();
    expect(vi.mocked(writeFile).mock.calls[0][1]).toEqual(EDITED);
  });

  it('SV-03: the preference defaults to off, so saving never changes a file silently', () => {
    const seen: boolean[] = [];
    function Probe() {
      const { state } = useEditorContext();
      seen.push(state.stripMetadataOnSave);
      return null;
    }
    render(<EditorProvider><Probe /></EditorProvider>);

    expect(seen[0]).toBe(false);
  });
});
