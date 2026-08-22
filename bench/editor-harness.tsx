// Mounts the REAL EditorView (StrictMode, like main.tsx) against a large fixture,
// with Tauri stubbed via vite aliases, plus a main-thread heartbeat HUD.
// Purpose: catch component-layer pathologies (render loops, unthrottled work)
// that a library-level bench cannot see.
// Mirrors src/main.tsx exactly: the guard must precede the react-dom import.
import '@/lib/reactDevPerfTracks';
import './instrument';
import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/styles/globals.css';
import '@/App.css';
import { ToolProvider } from '@/context/ToolContext';
import { EditorView } from '@/components/pdf-editor/EditorView';

const params = new URLSearchParams(location.search);
(window as any).__BENCH_FIXTURE_URL = params.get('f') || '/large_stress.pdf';

const hud = document.getElementById('hud')!;
const lines: string[] = [];
const B: any = { events: [], maxDrift: 0, renders: {}, blocked: [] };
(window as any).__BENCH = B;

function log(msg: string) {
  const t = Math.round(performance.now());
  B.events.push({ t, msg });
  lines.push(`[${t}] ${msg}`);
  if (lines.length > 120) lines.shift();
  hud.textContent = lines.join('\n');
  console.log(`[${t}] ${msg}`);
}
B.log = log;

// Main-thread heartbeat: the only reliable signal for "the UI is frozen".
let last = performance.now();
setInterval(() => {
  const now = performance.now();
  const drift = now - last - 100;
  last = now;
  if (drift > B.maxDrift) B.maxDrift = Math.round(drift);
  if (drift > 300) { B.blocked.push(Math.round(drift)); log(`!! BLOCKED ${Math.round(drift)}ms`); }
}, 100);

// Count renders per component to expose runaway render loops.
const origCreate = React.createElement;
(React as any).createElement = function (type: any, ...rest: any[]) {
  if (typeof type === 'function' && type.name) {
    B.renders[type.name] = (B.renders[type.name] || 0) + 1;
  }
  return origCreate.call(React, type, ...rest);
};

log('mounting EditorView…');
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToolProvider>
      {/* Same root wrapper App.tsx uses — without it the editor's flex layout
          collapses, the page grows to the height of the whole page list, and the
          tool sidebar lays out as a row at the bottom. */}
      <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
        <EditorView filePath="/fixture/large_stress.pdf" />
      </div>
    </ToolProvider>
  </StrictMode>,
);
