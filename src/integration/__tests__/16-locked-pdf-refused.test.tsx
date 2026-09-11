// @vitest-environment jsdom
/**
 * Suite 16 — A password-protected PDF is refused at the door
 *
 * [LOCK-01] Reported from a real Ubuntu build: opening a protected PDF in
 * Rotate PDF showed the page grid with nothing in it to select.
 *
 * The cause is that every flow opens the document with pdf-lib's
 * `ignoreEncryption: true`, which is exactly what it says — the load succeeds
 * and `getPageCount()` reports honestly. Measured on `test-fixtures/locked.pdf`:
 * it loads, `isEncrypted` is true, and it reports **6 pages**. So the flow
 * advances, lays out six tiles, and only then does pdf.js fail to decrypt any
 * of them. The user is left on a working-looking screen with nothing on it and
 * no statement of what went wrong.
 *
 * Every PDF tool has to say so up front. Unlock used to be the exception —
 * accepting an encrypted file was its whole purpose — but Protect and Unlock
 * were removed, so there is no longer a tool that legitimately takes one.
 */
import { describe, it, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFile } from '@tauri-apps/plugin-fs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import App from '@/App';

vi.mock('@tauri-apps/plugin-store', () => ({
  LazyStore: class {
    get() { return Promise.resolve(null); }
    set() { return Promise.resolve(undefined); }
    save() { return Promise.resolve(undefined); }
  },
}));
vi.mock('@/hooks/useDependencies', () => ({
  useDependencies: () => ({
    available: { ghostscript: true, calibre: true, libreoffice: true },
    loading: false,
    getHint: () => '',
    isAvailable: () => true,
  }),
}));
vi.mock('@/hooks/useFileOpen', () => ({ openFilePicker: vi.fn() }));
import { openFilePicker } from '@/hooks/useFileOpen';
vi.mock('@/lib/pdfThumbnail', () => ({
  renderAllPdfPages: vi.fn().mockResolvedValue([]),
  renderPdfThumbnail: vi.fn().mockResolvedValue('blob:preview'),
}));
vi.mock('@/lib/imageProcessor', () => ({ processImage: vi.fn() }));
vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn().mockResolvedValue(null),
  save: vi.fn(() => new Promise(() => {})),
  ask: vi.fn().mockResolvedValue(true),
}));

Object.defineProperty(URL, 'createObjectURL', { value: vi.fn().mockReturnValue('blob:fake'), writable: true });
Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), writable: true });

afterEach(cleanup);

// A real Ghostscript-encrypted PDF (RC4-128), not a stub. The bug only exists
// because the file is genuinely loadable-but-undecryptable, which no synthetic
// byte array reproduces.
const LOCKED = new Uint8Array(readFileSync(join(process.cwd(), 'test-fixtures', 'locked.pdf')));

beforeEach(() => {
  vi.mocked(readFile).mockResolvedValue(LOCKED);
});

/**
 * Every PDF tool that cannot work on an encrypted document.
 *
 * Which is now every PDF tool there is: Unlock, the one that legitimately
 * accepted an encrypted document, was removed along with Protect.
 */
const TOOLS: Array<[string, RegExp]> = [
  ['Rotate PDF', /rotate pdf/i],
  ['Crop PDF', /crop pdf/i],
  ['Organize PDF', /organi[sz]e pdf/i],
  ['Page Numbers', /page numbers/i],
  ['Watermark', /watermark/i],
  ['Split PDF', /split pdf/i],
  ['PDF to JPG', /pdf to jpg/i],
  ['Sign PDF', /sign pdf/i],
  ['Redact PDF', /redact pdf/i],
  ['Repair PDF', /repair pdf/i],
];

describe('Suite 16 — a locked PDF is refused, not silently emptied', () => {
  it.each(TOOLS)('[LOCK-01] %s says the file is password-protected', async (_name, pattern) => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getAllByRole('button', { name: pattern })[0]);

    vi.mocked(openFilePicker).mockResolvedValueOnce('/test/locked.pdf');
    await user.click(await screen.findByRole('button', { name: /open file/i }));

    // The message has to name the cause. "Nothing to select" is what the user
    // saw, and it reads as the tool being broken rather than the file being
    // locked.
    await screen.findByText(/password-protected/i, {}, { timeout: 3000 });
  });
});
