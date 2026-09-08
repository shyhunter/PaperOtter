/**
 * The one piece of mutable state behind every mocked Tauri module.
 *
 * Lives on `window` rather than in module scope so a Playwright test can seed it
 * with `page.addInitScript` *before* the app's first import runs. The modules
 * below read it lazily, at call time, so seeding order never matters.
 *
 * Everything here is JSON-serialisable — `addInitScript` structured-clones its
 * argument, and a Uint8Array does not survive that intact across every browser.
 * Bytes are therefore `number[]` on the wire and converted at the boundary.
 */

export interface TauriMockState {
  /** In-memory filesystem: absolute path -> file bytes. */
  files: Record<string, number[]>;
  /** Paths the open dialog returns, in order. A string[] entry is a multi-select. */
  openQueue: (string | string[])[];
  /** Paths the save dialog returns, in order. */
  saveQueue: string[];
  /** Answers `ask()` gives, in order. Defaults to true once exhausted. */
  askQueue: boolean[];
  /** Canned results per Rust command name. An unregistered command throws. */
  invokeResults: Record<string, unknown>;
  /** Backing store for LazyStore, keyed by store file then key. */
  stores: Record<string, Record<string, unknown>>;
  /** Values for the path APIs, so a test can pin them per platform. */
  paths: { temp: string; download: string; resource: string };
  /** Every mocked call, in order. The assertion surface for "did it save?". */
  calls: { api: string; args: unknown[] }[];
}

const DEFAULTS: TauriMockState = {
  files: {},
  openQueue: [],
  saveQueue: [],
  askQueue: [],
  invokeResults: {},
  stores: {},
  paths: { temp: '/tmp/', download: '/tmp/downloads/', resource: '/tmp/resources/' },
  calls: [],
};

declare global {
  interface Window {
    __TAURI_MOCK__?: Partial<TauriMockState>;
  }
}

/** The live state, created on first touch so a test may seed only what it cares about. */
export function state(): TauriMockState {
  const seeded = (window.__TAURI_MOCK__ ??= {});
  for (const [key, value] of Object.entries(DEFAULTS)) {
    if (seeded[key as keyof TauriMockState] === undefined) {
      // Structured-cloned seeds are already independent; the defaults are not,
      // so each one is copied rather than shared between page loads.
      (seeded as Record<string, unknown>)[key] = structuredClone(value);
    }
  }
  return seeded as TauriMockState;
}

/** Record a call so tests can assert on effects that leave no DOM trace. */
export function record(api: string, ...args: unknown[]): void {
  state().calls.push({ api, args });
}

/**
 * Fail loudly rather than returning a plausible empty value.
 *
 * The defect this whole harness exists to catch is a suite that goes green while
 * proving nothing, and a mock that quietly answers `{}` to a command it has
 * never heard of is exactly that failure in miniature. A test that needs a Rust
 * command must say so.
 */
export function unregistered(api: string, detail: string): never {
  throw new Error(
    `[tauri-mock] ${api} was called with ${detail}, which no test registered.\n` +
      `Register it (see src/browser-tests/support/app.ts) rather than letting the ` +
      `harness invent an answer.`,
  );
}
