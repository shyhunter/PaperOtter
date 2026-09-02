# Regression specs

Every defect that was found by hand and then fixed, pinned so it can be
re-checked without anyone preparing anything first.

## Running them

```
npm run test:regressions
```

That builds the e2e binary if it is stale, generates fixtures, runs the suite,
and writes the results. There is nothing to set up and no file to copy: each
spec creates the documents it needs — a read-only PDF, one that disappears
mid-flow, one that gets renamed — from the committed fixtures, and removes them
afterwards.

`npm run test:regressions:only` skips the rebuild when the binary is current.

## Where the results go

`.e2e-results/` (git-ignored):

- `latest.md` — what a person reads: pass, fail, **and what was skipped and
  why**, because a green run on a machine that skipped half the suite is not
  full coverage and should not look like it.
- `latest.json` — the same run for tooling, and for diffing one run against
  another.

## Where they run

**Everywhere the app runs: macOS, Linux and Windows.**

This used to say the opposite, and the correction is worth keeping. The old
approach drove the webview through an external WebDriver — `WebKitWebDriver` on
Linux, Edge Driver on Windows — and Apple ships no equivalent, because
`safaridriver` cannot attach to an app's `WKWebView`. On that stack the suite
genuinely could not run on a Mac.

`tauri-webdriver-automation` removed that constraint by embedding the driver in
the app itself, under the `e2e` feature. The note stayed behind and said the
suite was impossible on the one machine most of this project's development
happens on. A stale doc costs as much as a stale test: it stops work that would
have succeeded, and nobody finds out because nobody tries.

One command, whichever platform you are on:

```
npm run test:regressions
```

The build flag is not portable and the script handles it: macOS needs
`--bundles app`, because the session launches
`Papercut.app/Contents/MacOS/tauri-app` with the Ghostscript sidecar beside it
inside the bundle; Linux and Windows launch the plain binary from
`target/debug/` and bundling there is wasted work that also fails.

On Linux you need `tauri-wd` once — `cargo install tauri-webdriver-automation` —
and a display. A desktop session is enough; headless wants `xvfb-run`.

Individual specs still skip themselves where the *behaviour* is platform-bound
rather than the driver: file modes are POSIX, OCR is macOS-only, and the
Ghostscript process check needs `pgrep`. A skip is recorded with its reason
rather than passing quietly.

## What is here

| Spec | Covers | Depends on |
|---|---|---|
| `save-file-permissions` | FP-01 – FP-05: read-only, deleted, renamed, retry, and Save as… offered instead of a doomed retry | merged |
| `locked-pdf` | LOCK-01 across eleven tools, plus Unlock still accepting one | merged |
| `save-location` | Save as… opens the source folder | **PR #96** |
| `destinations` | Empty first run, saving a setting, and the verdict on a real result | **PR #94** |
| `dashboard-drops` | A second drop joins the first, dedupe, type replacement | merged |

Two specs assert behaviour that is not on `main` yet. They will fail until those
PRs land, which is the correct failure — the spec is right and the code is not
there.

## What these cannot cover

Worth stating so a green run is not read as more than it is:

- **The double save dialog.** It is React StrictMode double-invoking an effect,
  which only happens in development. A built app shows one dialog whether or not
  the fix is present, so that regression lives in jsdom and can only live there.
- **Anything visual.** Redaction opacity, contrast, alignment. The suite can
  assert a class is present; it cannot see a colour.
- **Whether copy reads well.** `I18N-06` proves placeholders survive. Only a
  person can say whether a German sentence sounds like a person wrote it.
- **Native drag-drop.** WebDriver cannot synthesise an OS drop into a Tauri
  webview. Covering that needs a test-only command that emits the same payload,
  which tests our handler in the real app but not the OS boundary.
