import { vi } from 'vitest';

// Mock @tauri-apps/plugin-fs — the native plugin is not available in a Node test environment.
// Individual tests control what readFile returns via vi.mocked(readFile).mockResolvedValue(...)
vi.mock('@tauri-apps/plugin-fs', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

// Mock @tauri-apps/api/core — Tauri IPC is not available in Node.
// Image tests control what invoke returns via vi.mocked(invoke).mockResolvedValue(...)
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

// Stub createImageBitmap — browser API not available in Node environment.
// Default returns 100×80. Tests that need specific dimensions use mockResolvedValueOnce.
vi.stubGlobal(
  'createImageBitmap',
  vi.fn(async () => ({ width: 100, height: 80, close: vi.fn() })),
);
