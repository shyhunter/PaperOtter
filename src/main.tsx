// MUST stay above the react-dom import: react-dom decides at module-evaluation
// time whether to emit dev performance tracks, and that instrumentation freezes
// the app on large PDFs. See src/lib/reactDevPerfTracks.ts.
import "./lib/reactDevPerfTracks";
import "./styles/globals.css";
import "./assets/fonts.css";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { diagLog, diagLogReset } from "./lib/diagLog";

diagLogReset().then(() => {
  let last = performance.now();
  setInterval(() => {
    const now = performance.now();
    const drift = now - last - 500;
    if (drift > 30) diagLog(`hb drift=${drift.toFixed(0)}`);
    last = now;
  }, 500);
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
