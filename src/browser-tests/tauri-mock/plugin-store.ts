/** @tauri-apps/plugin-store — persistence for favourites, recents and signatures. */
import { record, state } from './state';

/**
 * A real class, not a factory.
 *
 * Several modules build their store at module scope (`const store = new
 * LazyStore(...)`). `new` against an arrow function throws at *import* time,
 * which fails a whole file before any test in it runs — the vitest setup file
 * records the same trap for the same reason.
 */
export class LazyStore {
  constructor(private readonly file: string) {}

  private bucket(): Record<string, unknown> {
    return (state().stores[this.file] ??= {});
  }

  async get<T = unknown>(key: string): Promise<T | undefined> {
    record('store.get', this.file, key);
    return this.bucket()[key] as T | undefined;
  }

  async set(key: string, value: unknown): Promise<void> {
    record('store.set', this.file, key, value);
    this.bucket()[key] = value;
  }

  async save(): Promise<void> {
    record('store.save', this.file);
  }
}
