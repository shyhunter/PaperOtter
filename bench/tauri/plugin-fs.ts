// Bench stub: serves the fixture as if it were on disk.
export async function readFile(_path: string): Promise<Uint8Array> {
  const f = (window as any).__BENCH_FIXTURE_URL || '/large_stress.pdf';
  return new Uint8Array(await (await fetch(f)).arrayBuffer());
}
export async function writeFile(_p: string, _d: Uint8Array) {}
export async function remove(_p: string) {}
export async function mkdir(_p: string, _o?: unknown) {}
export async function exists(_p: string) { return true; }
