import { describe, it, expect, vi, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { readFile } from '@tauri-apps/plugin-fs';
import { invoke } from '@tauri-apps/api/core';
import { processImage } from '@/lib/imageProcessor';
import type { ImageProcessingOptions } from '@/types/file';

// Path to capabilities file — resolved relative to this test file
// src/lib/__tests__/ -> ../../../ -> project root -> src-tauri/capabilities/default.json
const capPath = path.join(__dirname, '../../../src-tauri/capabilities/default.json');

// ─── Static config assertion ──────────────────────────────────────────────────
//
// Reads the real capabilities/default.json from disk and asserts that no
// permission identifier starts with "http:".  This is a structural guarantee
// that the Tauri capability config cannot grant outbound HTTP access.

describe('Privacy — Tauri capability config', () => {
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
    vi.unstubAllGlobals();
  });

  it('processing never calls window.fetch', async () => {
    // Arrange: stub fetch so any accidental call is recorded
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

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
