# bench — large-document repro harness

Automated tests in this repo all use small, synthetic PDFs, so they cannot
exercise anything that only goes wrong on a big real-world document. This
harness closes that gap: it mounts the **real** `EditorView` in a **real**
browser against a large PDF, with Tauri's plugins stubbed, and watches the main
thread for stalls.

It is what finally located the "editor freezes on large PDFs" bug — see
`.planning/EDITOR_FREEZE_BUG_HANDOFF.md`.

## Setup

```bash
npm i -D playwright          # not currently a project dependency
npx playwright install webkit chromium
```

Use **webkit** by default: it is the same engine family as the WKWebView that
Tauri actually ships on macOS.

## Make a fixture

```bash
mkdir -p bench/fixtures/imgs
for i in 1 2 3 4 5 6 7 8; do
  sips -Z $((400 + i*40)) -s format jpeg -s formatOptions 60 \
    test-fixtures/pexels-pixabay-459225.jpg --out bench/fixtures/imgs/img$i.jpg
done
node bench/make-large-fixture.mjs bench/fixtures/imgs bench/fixtures/large_stress.pdf 688 2
```

That produces ~42 MB / 688 pages / 1376 images. Any real large PDF works too —
just drop it in `bench/fixtures/`.

## Run

```bash
BENCH_FIXTURE_DIR=$PWD/bench/fixtures npx vite --config bench/vite.config.ts

# all tool panels must stay responsive
BENCH_ENGINE=webkit node bench/drive-sweep.mjs \
  "http://localhost:1499/editor.html?f=/large_stress.pdf"

# control run: re-enables React's dev performance tracks. MUST fail.
BENCH_ENGINE=webkit node bench/drive-sweep.mjs \
  "http://localhost:1499/editor.html?f=/large_stress.pdf&tracks=1"
```

`drive-sweep.mjs` exits non-zero if the main thread ever stops answering, or if
a panel fails to open. Always run the control too — a check that cannot fail
proves nothing.

## What's here

| File | Purpose |
|---|---|
| `editor.html` / `editor-harness.tsx` | Mounts the real `EditorView` (StrictMode, like `src/main.tsx`) |
| `react-repro.html` / `react-repro.tsx` | Minimal repro: ~25 lines of React, no PDF code, freezes on a changing `Uint8Array` prop |
| `drive-sweep.mjs` | Opens every sidebar tool, asserts responsiveness |
| `drive-editor.mjs` | Single-tool walkthrough with idle probes |
| `drive-repro.mjs` | Driver for `react-repro` |
| `harness.ts` / `index.html` | Library-level bench (pdf-lib / pdf.js timings only, no React) |
| `tauri/*` | Stubs for `@tauri-apps/*`, wired up as Vite aliases |
| `instrument.ts` | The `?tracks=1` control switch |
| `make-large-fixture.mjs` | Fixture generator |

`bench/vite.config.ts` aliases `@` to `src/` and every `@tauri-apps/*` module to
a stub, so app code runs unmodified.
