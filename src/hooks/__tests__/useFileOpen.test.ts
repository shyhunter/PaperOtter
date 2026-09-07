import { describe, it, expect, vi, beforeEach } from 'vitest';
import { open } from '@/lib/dialog';
import { openFilePicker } from '@/hooks/useFileOpen';
import { EXTENSIONS_BY_FORMAT, extensionsForFormats } from '@/lib/fileValidation';

/**
 * [PICK] The open dialog shows what the tool can work on, and nothing else.
 *
 * Reported as "Compress image opens also pdfs, I was not expecting that". The
 * picker asked for every supported type whatever tool was open, and Compress
 * PDF and Compress Image are one flow that branches on the file rather than on
 * the tool -- so choosing the PDF it had just offered did not fail, it started
 * a PDF job under the image tool's name. Nothing said the tool had changed.
 *
 * Nineteen dedicated flows already scoped their own dialogs. These two, sharing
 * a flow, were the pair that never did.
 */

vi.mock('@/lib/dialog', () => ({ open: vi.fn() }));

beforeEach(() => vi.mocked(open).mockReset());

/** What the dialog was asked for on the last call. */
function requestedExtensions(): string[] {
  const options = vi.mocked(open).mock.calls[0][0] as { filters: { extensions: string[] }[] };
  return options.filters[0].extensions;
}

describe('openFilePicker', () => {
  it('[PICK-01] an image tool does not offer PDFs', async () => {
    vi.mocked(open).mockResolvedValue('/x/photo.jpg');
    await openFilePicker(['image']);
    expect(requestedExtensions()).not.toContain('pdf');
  });

  it('[PICK-02] a PDF tool does not offer images', async () => {
    vi.mocked(open).mockResolvedValue('/x/doc.pdf');
    await openFilePicker(['pdf']);
    expect(requestedExtensions()).toEqual(['pdf']);
  });

  it('[PICK-03] the offer covers every extension the format really has', async () => {
    // A picker narrower than the drop path is its own bug: a file could be
    // dragged in that the dialog would not show. This one listed jpg, jpeg,
    // png, webp, heic and heif, and left out tiff, bmp and gif -- all three of
    // which detectFormat calls images and the encoder decodes.
    vi.mocked(open).mockResolvedValue(null);
    await openFilePicker(['image']);
    expect(requestedExtensions()).toEqual([...EXTENSIONS_BY_FORMAT.image]);
  });

  it('[PICK-04] refuses a file outside the tool, however it was reached', async () => {
    // Every platform's dialog can reach a file the filter hides -- typing the
    // name, "All files", a drag into the sheet -- so the filter is a hint and
    // this is the gate.
    vi.mocked(open).mockResolvedValue('/x/document.pdf');
    await expect(openFilePicker(['image'])).resolves.toBeNull();
  });

  it('[PICK-05] returns the file when it is one the tool takes', async () => {
    vi.mocked(open).mockResolvedValue('/x/IMG_4032.heic');
    await expect(openFilePicker(['image'])).resolves.toBe('/x/IMG_4032.heic');
  });

  it('[PICK-06] a cancelled dialog is not an error', async () => {
    vi.mocked(open).mockResolvedValue(null);
    await expect(openFilePicker(['pdf'])).resolves.toBeNull();
  });
});

describe('extensionsForFormats', () => {
  it('[PICK-07] keeps the tool order, so the format it is named after leads', () => {
    expect(extensionsForFormats(['pdf', 'image'])[0]).toBe('pdf');
    expect(extensionsForFormats(['image', 'pdf'])[0]).toBe('jpg');
  });

  it('[PICK-08] every format has extensions, so no tool gets an empty dialog', () => {
    // An empty `extensions` array shows nothing at all on some platforms, which
    // would read as "this folder is empty" rather than "wrong tool".
    for (const format of ['pdf', 'image', 'document'] as const) {
      expect(extensionsForFormats([format]).length, format).toBeGreaterThan(0);
    }
  });
});
