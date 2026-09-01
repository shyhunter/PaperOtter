import { describe, it, expect, vi, beforeEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { saveOverFile, classifySaveFailure, saveFailureMessage } from '@/lib/saveOverFile';

/**
 * [SAVE-FP] The four file-permission paths, at the seam that talks to Rust.
 *
 * Save writes back over the document the flow was opened with, so each of these
 * runs against the user's only copy. The backend refuses cleanly (see
 * `atomic_replace` and its Rust tests); what is tested here is that the refusal
 * arrives as a fact the interface can act on rather than as one sentence
 * covering every possible fault.
 */

beforeEach(() => {
  vi.mocked(invoke).mockReset();
  vi.mocked(invoke).mockResolvedValue(undefined);
});

describe('saveOverFile', () => {
  it('[SAVE-FP-01] sends the bytes raw and the path as a header', async () => {
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    await saveOverFile('/docs/report.pdf', bytes);

    expect(vi.mocked(invoke)).toHaveBeenCalledWith(
      'save_over_file',
      bytes,
      { headers: { path: encodeURIComponent('/docs/report.pdf') } },
    );
  });

  it('[SAVE-FP-02] percent-encodes a non-ASCII path', async () => {
    // An IPC header is ASCII. "Ödeme Planı.pdf" is an ordinary filename for
    // this app's users, not an edge case.
    await saveOverFile('/docs/Ödeme Planı.pdf', new Uint8Array([1]));

    const [, , options] = vi.mocked(invoke).mock.calls[0] as [string, Uint8Array, { headers: Record<string, string> }];
    expect(options.headers.path).toBe('%2Fdocs%2F%C3%96deme%20Plan%C4%B1.pdf');
    expect(decodeURIComponent(options.headers.path)).toBe('/docs/Ödeme Planı.pdf');
  });
});

describe('classifySaveFailure', () => {
  /**
   * Tauri serialises a command's error to a plain string, so every `catch` in
   * SaveStep asked `err instanceof Error` and got false — the real reason was
   * discarded and the user was shown "Check that you have permission to write
   * to the selected location" whatever had actually happened, including for a
   * folder that no longer exists and for a save where they selected no location
   * at all.
   */
  it.each([
    ['READ_ONLY:ro.pdf', 'readOnly'],
    ['TARGET_GONE:gone.pdf', 'gone'],
    ['NO_DIR:/docs', 'gone'],
    ['DISK_FULL:big.pdf', 'diskFull'],
    ['FOLDER_READ_ONLY:f.pdf', 'unknown'],
    // The scope boundary. Deliberately generic: the existing fallback already
    // says "check that you have permission to write to that location", which is
    // the truth, and a user cannot act on the capability allow-list.
    ['FORBIDDEN:not a location Papercut may write to', 'unknown'],
    ['WRITE_FAILED:some io error', 'unknown'],
    ['REPLACE_FAILED:some io error', 'unknown'],
  ])('[SAVE-FP-03] reads %s as %s', (raw, expected) => {
    expect(classifySaveFailure(raw)).toBe(expected);
  });

  it('[SAVE-FP-03a] classifies a bare string rejection, not only an Error', () => {
    // The whole point: a Tauri rejection is a string.
    expect(classifySaveFailure('READ_ONLY:ro.pdf')).toBe('readOnly');
    expect(classifySaveFailure(new Error('READ_ONLY:ro.pdf'))).toBe('readOnly');
  });

  it('[SAVE-FP-03b] an unrecognised failure is unknown, never mislabelled', () => {
    expect(classifySaveFailure('something nobody predicted')).toBe('unknown');
    expect(classifySaveFailure(undefined)).toBe('unknown');
  });
});

describe('saveFailureMessage', () => {
  it('[SAVE-FP-04] names the file, and never leaks a raw OS string', () => {
    const readOnly = saveFailureMessage('READ_ONLY:payslip.pdf');
    expect(readOnly).toContain('payslip.pdf');
    expect(readOnly).not.toMatch(/os error|READ_ONLY:/);
  });

  it('[SAVE-FP-05] says the work is not lost when the file has gone', () => {
    // FP-02 and FP-03. The user deleted or renamed the document while the tool
    // was open; the processed bytes are still in hand and they need to know it.
    const gone = saveFailureMessage('TARGET_GONE:report.pdf');
    expect(gone).toContain('report.pdf');
    expect(gone).not.toMatch(/TARGET_GONE:/);
    expect(gone.toLowerCase()).toMatch(/save as/);
  });

  it('[SAVE-FP-06] a full disk is not reported as a permission problem', () => {
    const full = saveFailureMessage('DISK_FULL:scan.pdf');
    expect(full.toLowerCase()).toMatch(/space/);
    expect(full.toLowerCase()).not.toMatch(/permission/);
  });

  it('[SAVE-FP-07] gives distinct messages for distinct faults', () => {
    const messages = ['READ_ONLY:a.pdf', 'TARGET_GONE:a.pdf', 'DISK_FULL:a.pdf', 'WRITE_FAILED:x']
      .map((raw) => saveFailureMessage(raw));
    expect(new Set(messages).size, 'four faults must not share one sentence').toBe(4);
  });
});
