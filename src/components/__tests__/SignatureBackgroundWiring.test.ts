import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * [SIGWIRE] The background control reaches both places that place a signature.
 *
 * The engine and the shared control landed one commit before the wiring, and in
 * between there was a version of this feature that was complete, tested, and
 * had nothing to click. That gap is the thing worth guarding: the two sign
 * surfaces have drifted apart before, keeping separate signature lists in
 * separate storage for as long as both existed, and a control added to one and
 * forgotten in the other is the same failure again.
 *
 * A source scan because the alternative is rendering the whole editor, and a
 * test that heavy would be skipped the first time it got slow.
 */

const SIGN_SURFACES = [
  // Sign PDF places the signature in the Place step, where the document is on
  // screen: choosing a colour to match a page you cannot see is guessing.
  'src/components/sign-pdf/SignaturePlaceStep.tsx',
  // The editor's own sign panel.
  'src/components/pdf-editor/ToolSidebarPanel.tsx',
];

describe('signature background wiring', () => {
  it.each(SIGN_SURFACES)('[SIGWIRE-01] %s renders the shared control', (file) => {
    const src = readFileSync(file, 'utf8');
    expect(src, 'imports the shared control').toContain("from '@/components/SignatureBackground'");
    expect(src, 'renders it').toMatch(/<SignatureBackground\b/);
  });

  it.each(SIGN_SURFACES)('[SIGWIRE-02] %s offers the page to sample from', (file) => {
    // Without a canvas the control still works, but the eyedropper hides, and
    // matching the page by eye is the thing the reporter asked not to do.
    expect(readFileSync(file, 'utf8')).toMatch(/pageCanvas=\{/);
  });

  it('[SIGWIRE-03] Sign PDF embeds the composited copy, not the bare signature', () => {
    // The overlay and the output have to be the same image. A background chosen
    // against a preview that does not carry it is a guess, and a background that
    // shows in the preview and not in the file is worse.
    const src = readFileSync('src/components/sign-pdf/SignaturePlaceStep.tsx', 'utf8');
    expect(src, 'the preview shows the composited copy').toMatch(/src=\{composited\}/);
    expect(src, 'and so does the embed').toMatch(/dataUrlToBytes\(composited\)/);
    expect(src, 'the bare signature is no longer embedded')
      .not.toMatch(/dataUrlToBytes\(signatureDataUrl\)/);
  });
});
