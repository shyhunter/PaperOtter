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
  // Sign PDF places the signature in the Place step, over the live document.
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

  it('[SIGWIRE-02] the placed signature fills the box it is drawn in', () => {
    // Reported from a screenshot: "the choosen collor does not full all
    // background and on left and right some place stayes". The box was
    // border-2, and a border sits inside the layout box, so the image only got
    // width - 4 by height - 4 while the box height was computed from the full
    // width. object-contain then letterboxed the mismatch -- wider the wider
    // the signature -- and the background stopped short of the edges.
    //
    // pdf-lib stretches the image into the rectangle handleApply derives from
    // sigSize, so object-fill is also the one that agrees with the saved page.
    const src = readFileSync('src/components/sign-pdf/SignaturePlaceStep.tsx', 'utf8');
    // Classes only. The prose above the fix names both of the old values, and a
    // whole-file scan would read the explanation as the bug.
    const classNames = [...src.matchAll(/className="([^"]*)"/g)].map((m) => m[1]);
    const boxed = classNames.filter((c) => c.includes('absolute') && c.includes('border-2'));
    expect(boxed, 'the outline must not eat the image box').toEqual([]);
    expect(classNames, 'drawn outside the layout box instead')
      .toContainEqual(expect.stringContaining('ring-2 ring-primary/50'));
    expect(classNames, 'and the image takes the whole rectangle')
      .toContainEqual(expect.stringContaining('object-fill'));
    expect(classNames.filter((c) => c.includes('object-contain')), 'no letterboxing left').toEqual([]);
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

/**
 * [SIGSHARE] One list of saved signatures, read by both places that sign.
 *
 * The editor's sign panel kept its own list in localStorage under
 * 'papercut_saved_signatures'. That is the exact key useSavedSignatures
 * migrates out of and then deletes, so a signature saved in the editor lasted
 * only until the next time Sign PDF was opened, and one saved in Sign PDF was
 * never visible in the editor at all. Reported as "signature should have same
 * saved signatures also by edit -> signature and vice versa".
 *
 * The old list also stored a recipe -- text, font, colour -- so it could not
 * represent a drawn or uploaded signature even in principle.
 */
describe('saved signatures', () => {
  const EDITOR_PANEL = 'src/components/pdf-editor/ToolSidebarPanel.tsx';

  it('[SIGSHARE-01] the editor reads the shared store', () => {
    const src = readFileSync(EDITOR_PANEL, 'utf8');
    expect(src, 'uses the shared hook').toContain("from '@/hooks/useSavedSignatures'");
    expect(src, 'and its list').toMatch(/useSavedSignatures\(\)/);
  });

  it('[SIGSHARE-02] and keeps no private list of its own', () => {
    const src = readFileSync(EDITOR_PANEL, 'utf8');
    // The key appears in the migration and nowhere else. A second writer here
    // is the bug: the migration would keep eating what this panel wrote.
    const writes = src.split('\n').filter((line) =>
      /localStorage\.(setItem|getItem)/.test(line) && !line.trimStart().startsWith('//'));
    expect(writes, 'no localStorage signature list in the panel').toEqual([]);
  });

  it('[SIGSHARE-03] the migration is the only thing that touches the old key', () => {
    const owner = 'src/hooks/useSavedSignatures.ts';
    // Quoted, and not in a comment. The panel still names the key in the note
    // explaining why it no longer uses it, and that note is the point.
    const usesKey = (file: string) => readFileSync(file, 'utf8')
      .split('\n')
      .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
      .some((line) => /'papercut_saved_signatures'/.test(line));

    const others = [...new Set(SIGN_SURFACES.concat(EDITOR_PANEL))]
      .filter((f) => f !== owner)
      .filter(usesKey);
    expect(others, 'files still using the retired key').toEqual([]);
    expect(usesKey(owner), 'the migration still knows it').toBe(true);
  });
});
