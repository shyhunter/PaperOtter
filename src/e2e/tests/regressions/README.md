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

## Linux and Windows only

Tauri drives its webview through WebDriver, which means `WebKitWebDriver` on
Linux and Edge Driver on Windows. **There is no macOS equivalent** — Apple's
`safaridriver` cannot attach to an app's `WKWebView` — so these specs cannot run
on a Mac at all. On macOS the unit suite (`npx vitest run`) is the whole story.

Individual specs skip themselves where the *behaviour* is platform-bound rather
than the driver: file modes are POSIX, OCR is macOS-only. A skip is recorded
with its reason rather than passing quietly.

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
