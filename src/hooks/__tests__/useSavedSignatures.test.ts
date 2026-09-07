import { describe, it, expect, vi, beforeEach } from 'vitest';
import { hydrateLegacySignatures, type SavedSignature } from '@/hooks/useSavedSignatures';
import { rasteriseSignatureDataUrl } from '@/lib/signatureRaster';

/**
 * [LEGACYSIG] A signature carried over from the editor's old list is a picture.
 *
 * Reported with two screenshots: a saved tile showing its own name in a broken
 * image box, and then, after clicking it, step 3 of Sign PDF as an empty
 * window with the step bar sitting on Place.
 *
 * One cause. The migration out of the editor's localStorage stored the recipe
 * rather than the image -- name, font, colour, and `dataUrl: ''` -- on the
 * stated plan that "the panel rasterises these on first sight". No panel ever
 * did; nothing in the app read `legacyFont` at all. So the tile rendered
 * <img src="">, which is a broken image, and its alt text is the name, which
 * is why the name appeared twice on the tile. Selecting it passed '' upward,
 * and Sign PDF's Place step is guarded on `signatureDataUrl` being truthy, so
 * the guard turned the whole step away and rendered nothing.
 */

vi.mock('@/lib/signatureRaster', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/signatureRaster')>()),
  rasteriseSignatureDataUrl: vi.fn(),
}));

const PNG = 'data:image/png;base64,iVBORw0KGgo=';

/** An entry exactly as migrateLegacyEditorSignatures writes it. */
function carriedOver(name: string, font = 'cursive'): SavedSignature {
  return {
    id: name, name, type: 'typed', dataUrl: '', createdAt: 1,
    legacyFont: font, legacyColor: '#112233',
  };
}

const drawn: SavedSignature = {
  id: 'ok', name: 'Signature 1', type: 'drawn', dataUrl: PNG, createdAt: 2,
};

// mockClear, not mockReset: call history is what has to go between tests, and
// mockReset here leaves the mock in a state where a later mockImplementation
// that throws escapes the caller's catch, which reads as a bug in the code
// under test rather than in its double.
beforeEach(() => { vi.mocked(rasteriseSignatureDataUrl).mockClear().mockResolvedValue(PNG); });

describe('hydrateLegacySignatures', () => {
  it('[LEGACYSIG-01] draws the entry the migration left without a picture', async () => {
    const out = await hydrateLegacySignatures([carriedOver('This Is My Name')]);
    expect(out?.[0].dataUrl, 'the tile has an image to show').toBe(PNG);
  });

  it('[LEGACYSIG-02] draws it in the font and colour the recipe named', async () => {
    await hydrateLegacySignatures([carriedOver('Ada', 'serif')]);
    const [text, fontCss, , colour] = vi.mocked(rasteriseSignatureDataUrl).mock.calls[0];
    expect(text, 'the old list kept the text in the name').toBe('Ada');
    expect(fontCss, 'the value maps back to a real stack').toContain('Georgia');
    expect(colour).toBe('#112233');
  });

  it('[LEGACYSIG-03] a font value no longer offered still draws', async () => {
    // These values came out of a version that is gone; an unknown one must not
    // cost the signature.
    await hydrateLegacySignatures([carriedOver('Ada', 'copperplate-that-never-existed')]);
    expect(vi.mocked(rasteriseSignatureDataUrl)).toHaveBeenCalledOnce();
  });

  it('[LEGACYSIG-04] drops the recipe once it has been drawn', async () => {
    // Left in place it would look stale on every later read, and invite a
    // second pass that redraws a signature the user may have since edited.
    const out = await hydrateLegacySignatures([carriedOver('Ada')]);
    expect(out?.[0]).not.toHaveProperty('legacyFont');
    expect(out?.[0]).not.toHaveProperty('legacyColor');
  });

  it('[LEGACYSIG-05] drops an entry that will not draw, rather than keeping it broken', async () => {
    // A tile that can neither show a signature nor place one is worse than one
    // fewer signature, and the recipe it came from is already gone.
    vi.mocked(rasteriseSignatureDataUrl).mockResolvedValue(null);
    const out = await hydrateLegacySignatures([carriedOver('Ada'), drawn]);
    expect(out).toEqual([drawn]);
  });

  it('[LEGACYSIG-06] a rasteriser that throws costs one signature, not the list', async () => {
    vi.mocked(rasteriseSignatureDataUrl).mockImplementation(async () => {
      throw new Error('no canvas');
    });
    await expect(hydrateLegacySignatures([carriedOver('Ada'), drawn])).resolves.toEqual([drawn]);
  });

  it('[LEGACYSIG-07] leaves a list that needs nothing alone', async () => {
    // null means "no write needed", which keeps the store untouched on every
    // ordinary launch.
    await expect(hydrateLegacySignatures([drawn])).resolves.toBeNull();
    expect(vi.mocked(rasteriseSignatureDataUrl)).not.toHaveBeenCalled();
  });

  it('[LEGACYSIG-08] does not disturb the signatures that already have an image', async () => {
    const out = await hydrateLegacySignatures([carriedOver('Ada'), drawn]);
    expect(out?.[1], 'untouched, same object contents').toEqual(drawn);
  });
});
