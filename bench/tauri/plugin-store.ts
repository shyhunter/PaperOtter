export class LazyStore {
  constructor(_p?: string, _o?: unknown) {}
  async get(_k: string) { return undefined; }
  async set(_k: string, _v: unknown) {}
  async save() {}
  async delete(_k: string) {}
  async entries() { return []; }
}
