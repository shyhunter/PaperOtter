import { vi, expect } from 'vitest';
import * as jestDomMatchers from '@testing-library/jest-dom/matchers';

// Extend Vitest's expect with @testing-library/jest-dom matchers
// (toBeInTheDocument, toBeDisabled, toHaveTextContent, etc.)
expect.extend(jestDomMatchers);

// Mock @tauri-apps/plugin-fs — the native plugin is not available in a Node test environment.
// Default: readFile returns a 1 MB Uint8Array so that getFileSizeBytes produces a valid,
// under-limit size for integration tests that navigate through file selection.
// Individual tests override via vi.mocked(readFile).mockResolvedValue(...) or
// vi.mocked(getFileSizeBytes).mockResolvedValueOnce(...) as needed.
vi.mock('@tauri-apps/plugin-fs', () => ({
  readFile: vi.fn().mockResolvedValue(new Uint8Array(1024 * 1024)), // 1 MB default
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
// invoke must return a Promise (callers chain .then()); default resolves to '{}' for JSON callers.
// Image tests control what invoke returns via vi.mocked(invoke).mockResolvedValue(...)
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue('{}'),
  transformCallback: vi.fn(),
}));

// Mock @tauri-apps/api/event — Tauri event system not available in Node.
// listen returns an unlisten function; emit is a no-op.
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
  emit: vi.fn(),
}));

// Mock @tauri-apps/plugin-updater — native updater not available in Node.
vi.mock('@tauri-apps/plugin-updater', () => ({
  check: vi.fn().mockResolvedValue(null),
}));

// Mock @tauri-apps/plugin-process — native process APIs not available in Node.
vi.mock('@tauri-apps/plugin-process', () => ({
  relaunch: vi.fn(),
  exit: vi.fn(),
}));

// Mock @tauri-apps/api/webview — drag-drop listener used by useFileDrop hook.
vi.mock('@tauri-apps/api/webview', () => ({
  getCurrentWebview: vi.fn(() => ({
    onDragDropEvent: vi.fn().mockResolvedValue(() => {}),
  })),
}));

// Mock @tauri-apps/api/window — window operations used by close handler, etc.
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: vi.fn(() => ({
    onCloseRequested: vi.fn().mockResolvedValue(() => {}),
    destroy: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  })),
}));

// Mock @tauri-apps/plugin-store — persistent key-value store used by favorites/recents/signatures.
vi.mock('@tauri-apps/plugin-store', () => ({
  LazyStore: vi.fn().mockImplementation(() => ({
    get: vi.fn().mockResolvedValue(undefined),
    set: vi.fn().mockResolvedValue(undefined),
    save: vi.fn().mockResolvedValue(undefined),
  })),
}));

// Mock @tauri-apps/plugin-dialog — file open/save dialogs.
vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn().mockResolvedValue(null),
  save: vi.fn().mockResolvedValue(null),
  ask: vi.fn().mockResolvedValue(true),
}));

// Mock @tauri-apps/plugin-opener — URL/file opener.
vi.mock('@tauri-apps/plugin-opener', () => ({
  openUrl: vi.fn(),
  openPath: vi.fn(),
}));

// Stub createImageBitmap — browser API not available in Node environment.
// Default returns 100×80. Tests that need specific dimensions use mockResolvedValueOnce.
vi.stubGlobal(
  'createImageBitmap',
  vi.fn(async () => ({ width: 100, height: 80, close: vi.fn() })),
);

// Stub DOMMatrix — jsdom does not implement this; pdfjs-dist accesses it at import time.
vi.stubGlobal(
  'DOMMatrix',
  class DOMMatrix {
    m11 = 1; m12 = 0; m13 = 0; m14 = 0;
    m21 = 0; m22 = 1; m23 = 0; m24 = 0;
    m31 = 0; m32 = 0; m33 = 1; m34 = 0;
    m41 = 0; m42 = 0; m43 = 0; m44 = 1;
    a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
    is2D = true;
    isIdentity = true;
    inverse() { return new DOMMatrix(); }
    multiply() { return new DOMMatrix(); }
    translate() { return new DOMMatrix(); }
    scale() { return new DOMMatrix(); }
    rotate() { return new DOMMatrix(); }
    transformPoint() { return { x: 0, y: 0, z: 0, w: 1 }; }
    toFloat32Array() { return new Float32Array(16); }
    toFloat64Array() { return new Float64Array(16); }
  },
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
