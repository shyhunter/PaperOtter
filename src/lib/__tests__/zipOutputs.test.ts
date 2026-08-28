import { describe, it, expect } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { buildZip, toBytes } from '@/lib/zipOutputs';

// ─── BAT-07 — the archive must contain documents, not empty folders ──────────
//
// A three-file batch produced `papercut-batch-3-files.zip` holding three empty
// directories and no files. fflate treats any value that is not a Uint8Array as
// a nested directory, and every byte-returning Tauri command hands the webview
// an ArrayBuffer while the call sites all annotate it `Uint8Array`.
//
// Nothing else noticed: byteLength and Blob accept an ArrayBuffer, so sizes and
// previews were right the whole way through. Only the archive was hollow.

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);

describe('buildZip', () => {
  it('[BAT-07a] writes real files when given Uint8Arrays', () => {
    const zip = unzipSync(buildZip([
      { fileName: 'a.jpg', bytes: JPEG },
      { fileName: 'b.jpg', bytes: JPEG },
    ]));

    expect(Object.keys(zip).sort()).toEqual(['a.jpg', 'b.jpg']);
    expect(zip['a.jpg']).toEqual(JPEG);
  });

  it('[BAT-07b] writes real files when handed an ArrayBuffer, as Tauri actually returns', () => {
    // The regression itself. Before the fix this produced `a.jpg/` — a
    // directory entry of length zero — and the user lost every document.
    const asArrayBuffer = JPEG.slice().buffer;

    const zip = unzipSync(buildZip([
      { fileName: 'a.jpg', bytes: asArrayBuffer as unknown as Uint8Array },
    ]));

    expect(Object.keys(zip)).toEqual(['a.jpg']);
    expect(zip['a.jpg'].byteLength).toBe(JPEG.byteLength);
    expect(zip['a.jpg']).toEqual(JPEG);
  });

  it('[BAT-07c] never emits a directory entry', () => {
    // A trailing slash is what an empty folder looks like in an archive listing.
    const zip = unzipSync(buildZip([
      { fileName: 'scan-diploma-processed.jpg', bytes: JPEG.slice().buffer as unknown as Uint8Array },
      { fileName: 'scan-passport-processed.jpg', bytes: JPEG },
    ]));

    for (const name of Object.keys(zip)) {
      expect(name.endsWith('/'), `${name} is a directory, not a file`).toBe(false);
      expect(zip[name].byteLength, `${name} is empty`).toBeGreaterThan(0);
    }
  });

  it('[BAT-07d] keeps each file distinct rather than collapsing them', () => {
    const one = new TextEncoder().encode('first');
    const two = new TextEncoder().encode('second');

    const zip = unzipSync(buildZip([
      { fileName: 'one.txt', bytes: one },
      { fileName: 'two.txt', bytes: two },
    ]));

    expect(strFromU8(zip['one.txt'])).toBe('first');
    expect(strFromU8(zip['two.txt'])).toBe('second');
  });
});

describe('toBytes', () => {
  it('[BAT-07e] passes a Uint8Array through untouched', () => {
    expect(toBytes(JPEG)).toBe(JPEG);
  });

  it('[BAT-07f] wraps an ArrayBuffer without copying the wrong range', () => {
    const buf = JPEG.slice().buffer;
    expect(toBytes(buf)).toEqual(JPEG);
  });

  it('[BAT-07g] respects the offset of a view into a larger buffer', () => {
    // A naive `new Uint8Array(view.buffer)` would return the whole buffer and
    // silently write neighbouring bytes into the archive.
    const backing = new Uint8Array([0, 0, 1, 2, 3, 0, 0]);
    const view = new Uint8Array(backing.buffer, 2, 3);

    expect(toBytes(view)).toEqual(new Uint8Array([1, 2, 3]));
  });
});
