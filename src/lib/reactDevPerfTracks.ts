// Disables React's dev-only "Performance Tracks" instrumentation.
//
// React 19.2 added DevTools performance tracks to its development build. On any
// render where a prop changed, react-dom serialises the new prop value into a
// `performance.measure()` detail payload:
//
//   logComponentRender -> addObjectDiffToProperties -> addValueToProperties
//
// A `Uint8Array` matches none of the special cases there and falls through to
// the generic-object branch, which enumerates it with `for…in` — producing one
// row PER BYTE. The PDF editor passes document bytes as props (for example
// ToolSidebarPreview's `previewBytes`, which flips from null to `state.pdfBytes`
// the moment a tool option is picked), so opening a 30 MB PDF and clicking a
// tool built a ~30-million-row array and then structured-cloned it, on the main
// thread. Result: 100 % CPU, ~1.3 GB resident, and a window that never comes
// back — the "editor freezes on large PDFs" bug.
//
// react-dom decides once, when it is first imported, whether this feature is
// available:
//
//   supportsUserTiming = typeof console.timeStamp === 'function'
//                     && typeof performance.measure === 'function'
//
// Removing `console.timeStamp` before that happens turns the whole feature off.
// `performance.measure` is deliberately left alone so nothing else is affected.
//
// Production builds never had this problem — react-dom-client.production.js
// contains no `performance.measure` calls at all — so this guard is dev-only.
//
// IMPORTANT: this must run before `react-dom/client` is imported. See the
// import order in src/main.tsx, which is asserted by a test.
export function disableReactDevPerformanceTracks(): void {
  if (typeof console === 'undefined') return;
  try {
    delete (console as unknown as { timeStamp?: unknown }).timeStamp;
  } catch {
    // Some environments make console methods non-configurable; overwriting with
    // a non-function still fails react-dom's `typeof === 'function'` gate.
    (console as unknown as { timeStamp?: unknown }).timeStamp = undefined;
  }
}

if (import.meta.env.DEV) {
  disableReactDevPerformanceTracks();
}
