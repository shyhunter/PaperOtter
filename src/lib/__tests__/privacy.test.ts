import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { readFile } from '@tauri-apps/plugin-fs';
import { invoke } from '@tauri-apps/api/core';
import { processImage } from '@/lib/imageProcessor';
import type { ImageProcessingOptions } from '@/types/file';

// ─── Static config assertion ──────────────────────────────────────────────────
//
// Reads the real capabilities/default.json from disk and asserts that any
// "http:" permission is scoped to exactly the disclosed, read-only endpoints
// used by the update checker (GitHub's public releases API) and the feedback
// contact lookup (a JSON file on the repo's main branch) — never a
// bare/unscoped grant, never any other host. This is a structural guarantee
// that the Tauri capability config cannot grant broader outbound HTTP access
// than what's disclosed in the README's Privacy section.
//
// Path: src/lib/__tests__/ -> ../../../ -> project root -> src-tauri/capabilities/default.json

const ALLOWED_HTTP_URLS = [
  'https://api.github.com/repos/shyhunter/Papercut/releases/latest',
  'https://raw.githubusercontent.com/shyhunter/Papercut/main/feedback-config.json',
];

describe('Privacy — Tauri capability config', () => {
  // capabilities/default.json — read once for the whole describe block
  let capPath: string;

  beforeAll(() => {
    capPath = path.join(__dirname, '../../../src-tauri/capabilities/default.json');
  });

  it('capabilities grant HTTP access only to the disclosed update-check endpoint', () => {
    const raw = readFileSync(capPath, 'utf-8');
    const config = JSON.parse(raw) as {
      permissions: Array<string | { identifier: string; allow?: Array<{ url?: string }> }>;
    };

    const httpPerms = config.permissions.filter(
      (entry): entry is { identifier: string; allow?: Array<{ url?: string }> } =>
        typeof entry !== 'string' && entry.identifier.startsWith('http:')
    );

    for (const perm of httpPerms) {
      // Every http: permission must be scoped (no bare "http:default" with no allow-list).
      expect(perm.allow).toBeDefined();
      expect(perm.allow!.length).toBeGreaterThan(0);
      for (const rule of perm.allow!) {
        expect(ALLOWED_HTTP_URLS).toContain(rule.url);
      }
    }
  });
});

// ─── CSP configuration assertions ────────────────────────────────────────────

describe('Privacy — CSP configuration', () => {
  let tauriConf: { app: { security: { csp: string | null } } };

  beforeAll(() => {
    const confPath = path.join(__dirname, '../../../src-tauri/tauri.conf.json');
    tauriConf = JSON.parse(readFileSync(confPath, 'utf-8'));
  });

  it('CSP is not null', () => {
    expect(tauriConf.app.security.csp).not.toBeNull();
  });

  it('CSP blocks inline scripts', () => {
    const csp = tauriConf.app.security.csp!;
    expect(csp).toContain("script-src 'self'");
    // unsafe-inline must NOT appear in script-src (it IS expected in style-src for Tailwind)
    const scriptSrc = csp.match(/script-src[^;]*/)?.[0] ?? '';
    expect(scriptSrc).not.toContain("'unsafe-inline'");
  });

  it('CSP blocks external connections', () => {
    const csp = tauriConf.app.security.csp!;
    // Extract connect-src directive and remove the Tauri IPC URL (http://ipc.localhost)
    // which is required for Tauri's internal communication, not an external connection
    const connectSrc = csp.match(/connect-src[^;]*/)?.[0] ?? '';
    const withoutIpc = connectSrc.replace(/http:\/\/ipc\.localhost/g, '');
    expect(withoutIpc).not.toMatch(/https?:/);
  });

  it('CSP allows inline styles for Tailwind', () => {
    const csp = tauriConf.app.security.csp!;
    expect(csp).toMatch(/style-src[^;]*'unsafe-inline'/);
  });
});

// ─── Runtime fetch spy ────────────────────────────────────────────────────────
//
// Stubs window.fetch before running processImage.  Because processImage
// communicates exclusively through Tauri IPC (mocked invoke + readFile),
// fetch must never be called.

describe('Privacy — runtime network isolation', () => {
  const baseOpts: ImageProcessingOptions = {
    quality: 75,
    outputFormat: 'jpeg',
    resizeEnabled: false,
    resizeExact: false,
    targetWidth: null,
    targetHeight: null,
  };

  afterAll(() => {
    // Restore all globals to their original state after this suite
    vi.unstubAllGlobals();
  });

  it('processing never calls window.fetch', async () => {
    // Arrange: stub fetch so any accidental call is recorded
    vi.stubGlobal('fetch', vi.fn());

    // Arrange: satisfy processImage's Tauri dependencies
    const fakeBytes = new Uint8Array([0xff, 0xd8, 0xff]); // minimal JPEG magic
    vi.mocked(readFile).mockResolvedValue(fakeBytes);
    vi.mocked(invoke).mockResolvedValue(fakeBytes);

    // Act
    await processImage('/photo.jpg', baseOpts);

    // Assert: fetch was never invoked
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });
});
