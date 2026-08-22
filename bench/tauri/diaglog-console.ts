// Bench replacement for src/lib/diagLog.ts: same API, but logs synchronously to
// the console so the last line before a main-thread block is always visible.
export function diagLog(msg: string) {
  console.log(`[${performance.now().toFixed(0)}] DIAG ${msg}`);
}
export async function diagLogReset() {}
