// Minimal reproduction, no PDF code at all: a React component that receives a
// large Uint8Array as a prop, and a click that changes a sibling prop.
// ?mb=30 sets the array size; ?wrapped=1 uses an opaque holder instead.
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';

const q = new URLSearchParams(location.search);
const MB = Number(q.get('mb') ?? 30);
const WRAPPED = q.get('wrapped') === '1';

const raw = new Uint8Array(MB * 1024 * 1024);

/** Opaque holder: the bytes live in a private field, so React's `for…in`
 *  props walk finds nothing to enumerate. */
class PdfBytes {
  #bytes: Uint8Array;
  constructor(b: Uint8Array) { this.#bytes = b; }
  get bytes() { return this.#bytes; }
  get byteLength() { return this.#bytes.byteLength; }
}

const payload: any = WRAPPED ? new PdfBytes(raw) : raw;

const B: any = { maxDrift: 0, clicked: false, sinceClick: -1 };
(window as any).__BENCH = B;
let last = performance.now();
setInterval(() => {
  const now = performance.now();
  const d = now - last - 100; last = now;
  if (d > B.maxDrift) B.maxDrift = Math.round(d);
  if (B.clicked) B.sinceClick = Math.round(now - B.clickedAt);
}, 100);

function Child({ previewBytes, rotation }: { previewBytes: any; rotation: number }) {
  return <div>preview={previewBytes?.byteLength ?? 0} rotation={rotation}</div>;
}

function App() {
  const [rotation, setRotation] = useState(0);
  return (
    <div>
      <p>mode={WRAPPED ? 'wrapped (opaque holder)' : 'raw Uint8Array prop'} size={MB}MB</p>
      <button onClick={() => { B.clicked = true; B.clickedAt = performance.now();
        console.log('CLICK'); setRotation(90); }}>Turn Right</button>
      {/* Mirrors ToolSidebarPreview: previewBytes flips null -> bytes on click,
          so React sees a CHANGED prop and serialises the new value. */}
      <Child previewBytes={rotation !== 0 ? payload : null} rotation={rotation} />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
console.log('mounted');
