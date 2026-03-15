import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { readFile } from '@tauri-apps/plugin-fs';
import { invoke } from '@tauri-apps/api/core';
import { processImage } from '@/lib/imageProcessor';
import type { ImageProcessingOptions } from '@/types/file';

// ─── Static config assertion ──────────────────────────────────────────────────
//
// Reads the real capabilities/default.json from disk and asserts that no
// permission identifier starts with "http:".  This is a structural guarantee
// that the Tauri capability config cannot grant outbound HTTP access.
//
// Path: src/lib/__tests__/ -> ../../../ -> project root -> src-tauri/capabilities/default.json

describe('Privacy — Tauri capability config', () => {
  // capabilities/default.json — read once for the whole describe block
  let capPath: string;

  beforeAll(() => {
    capPath = path.join(__dirname, '../../../src-tauri/capabilities/default.json');
  });

  it('capabilities grant no HTTP access', () => {
    const raw = readFileSync(capPath, 'utf-8');
    const config = JSON.parse(raw) as {
      permissions: Array<string | { identifier: string; allow?: unknown[] }>;
    };

    // Normalize: permission entries may be plain strings or objects with an
    // `identifier` field.  Extract the identifier string from both forms.
    const identifiers = config.permissions.map((entry) => {
      if (typeof entry === 'string') return entry;
      return entry.identifier;
    });

    const httpPerms = identifiers.filter((id) => id.startsWith('http:'));
    expect(httpPerms).toHaveLength(0);
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
