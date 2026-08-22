// Bench-only switches. Everything is best-effort: an environment that refuses a
// patch must not take the harness down with it.
function trySafe(label: string, fn: () => void) {
  try { fn(); } catch (e) { console.log(`[instrument] skipped ${label}: ${e}`); }
}

// CONTROL SWITCH: put React's dev performance tracks back, to prove the sweep
// really does catch the freeze when src/lib/reactDevPerfTracks.ts is absent.
// This runs after the app guard but still before react-dom is imported, so
// react-dom sees console.timeStamp present and enables the instrumentation.
if (new URLSearchParams(location.search).get('tracks') === '1') {
  trySafe('restore console.timeStamp', () => {
    (console as unknown as { timeStamp: () => void }).timeStamp = function () {};
    console.log('[instrument] React performance tracks RE-ENABLED (control run)');
  });
}
