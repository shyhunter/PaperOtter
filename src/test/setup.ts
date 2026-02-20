import { vi } from 'vitest';

// Mock @tauri-apps/plugin-fs — the native plugin is not available in a Node test environment.
// Individual tests control what readFile returns via vi.mocked(readFile).mockResolvedValue(...)
vi.mock('@tauri-apps/plugin-fs', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));
