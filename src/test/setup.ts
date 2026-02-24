import { vi, expect } from 'vitest';
import * as jestDomMatchers from '@testing-library/jest-dom/matchers';

// Extend Vitest's expect with @testing-library/jest-dom matchers
// (toBeInTheDocument, toBeDisabled, toHaveTextContent, etc.)
expect.extend(jestDomMatchers);

// Mock @tauri-apps/plugin-fs — the native plugin is not available in a Node test environment.
// Individual tests control what readFile returns via vi.mocked(readFile).mockResolvedValue(...)
vi.mock('@tauri-apps/plugin-fs', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  remove: vi.fn().mockResolvedValue(undefined),
}));

// Mock @tauri-apps/api/path — Tauri path APIs are not available in Node.
// tempDir returns a mock temp directory; join concatenates with '/' separator.
vi.mock('@tauri-apps/api/path', () => ({
  tempDir: vi.fn().mockResolvedValue('/tmp/'),
  join: vi.fn().mockImplementation((...parts: string[]) => Promise.resolve(parts.join('/'))),
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

// Stub window.matchMedia — jsdom does not implement this; required by sonner (toast library).
vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: vi.fn(),
  removeListener: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
})));
