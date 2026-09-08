/**
 * Boots the shipped App, mirroring src/main.tsx as closely as is useful.
 *
 * StrictMode is kept deliberately. Its double-invoked effects are how the
 * detached-ArrayBuffer defect in pdfThumbnail was found, and a harness that
 * quietly dropped it would stop seeing that entire class of bug.
 *
 * The only omission is main.tsx's dev heartbeat, which logs drift on a 500ms
 * timer — under Playwright's fake clock that produces noise and nothing else.
 */
import '@/lib/reactDevPerfTracks';
import '@/styles/globals.css';
import '@/assets/fonts.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '@/App';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
