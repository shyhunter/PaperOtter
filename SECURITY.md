# Security Policy

## Reporting a vulnerability

**Please do not open a public issue for a security problem.**

Email the address shown in the app under **About → Send feedback**. That is the
reliable route today.

Once this repository is public, GitHub's private reporting (*Security → Report a
vulnerability*) will be the preferred channel; it is not available on a private
repository, which this one currently is.

Please include: what you found, how to reproduce it, the Papercut version
(About dialog), and your OS. If you have a proof of concept, attach it.

Expect an acknowledgement within a week. There is no bounty programme.

## What is in scope

Papercut is a local desktop application. It has no server, no account system and
no telemetry, so the interesting surface is narrower than for a web app:

- **Arbitrary code execution** via a crafted PDF, image or document. Files are
  parsed by pdf.js and pdf-lib in the webview, and by Ghostscript and the Rust
  `image` crate outside it.
- **Escaping the file-access scope.** The app may only read and write under
  Documents, Downloads, Desktop and the system temp directory; anything that
  reaches beyond those is a bug.
- **Anything that makes the app reach the network.** Papercut is offline by
  design. Two outbound URLs are allow-listed: the GitHub releases endpoint for
  the update check and a feedback-config file. Any other outbound request is a
  finding.
- **Bundled dependencies**, including the Ghostscript sidecar.

## What is not in scope

- The unsigned-binary warnings on macOS ("Papercut is damaged") and Windows
  SmartScreen. These are known and expected until code signing is in place; see
  the release notes for the workaround.
- Denial of service through deliberately enormous or malformed input, unless it
  escalates to something worse than the app becoming unresponsive.
- Findings that require an attacker to already have code execution on the
  machine.

## Standing dependency advisories

`npm audit --omit=dev` runs on every pull request and currently reports nothing.
Per project rule P015, a high or critical advisory blocks a merge.

Two Rust advisories are open against `src-tauri/Cargo.lock` and cannot be closed
by upgrading. Both were dismissed on 2026-09-03 rather than left standing,
because an alert nobody can act on teaches you to stop reading alerts. The
reasoning is recorded here so it is not reconstructed from scratch a third time.

**`rand`, GHSA-cq8v-f236-94qc, low.** Dismissed as *not used*. Two vulnerable
copies are in the lockfile and neither is linked into a shipped binary:

- `0.7.3` reaches us through `phf_codegen 0.8`, a **build-dependency** of
  `selectors`, itself under `kuchikiki` and `tauri-utils`.
- `0.8.5` reaches us through the `phf_macros` **proc-macro** chain, under
  `cssparser`.

Both generate perfect-hash tables for CSS selector matching at compile time. The
advisory concerns `rand::rng()` being unsound when a custom logger is installed,
which a build script does not do. `0.8.5` can be moved to `0.8.8` with
`cargo update -p rand@0.8.5 --precise 0.8.8`, but `0.7.3` cannot: the fix landed
in `0.8.6`, a semver-major step that `phf_codegen 0.8` will not accept. Bumping
one copy therefore does not clear the advisory.

*Re-check when:* `selectors` or `kuchikiki` moves to a newer `phf`.

**`glib`, GHSA-wrw7-89jp-8q8g, medium.** Dismissed as *tolerable risk*. Two
things bound it:

- **Linux only.** `glib` is absent from the macOS and Windows dependency trees
  entirely, verified per target. It arrives via `atk` and `gtk 0.18.2`, under
  `muda` and `tauri 2.11.5`, so it exists only in the Linux build.
- **Not upgradable.** The fix is in `0.20.0`, and cargo refuses it outright:
  `gtk 0.18.2` requires `glib ^0.18`, and gtk 0.18.2 is pinned by
  `tauri 2.11.5`. There is no lockfile edit that resolves this.

The unsoundness is in the `Iterator` and `DoubleEndedIterator` impls for
`glib::VariantStrIter`, which no Papercut code calls; reaching it would require
GTK itself to iterate a malformed variant string array.

*Re-check when:* Tauri moves to the gtk-rs 0.20 stack. Since `tauri` is a direct
dependency, its next major bump is the moment to look.

Dismissals are reversible. If either of these becomes reachable or fixable,
reopen the alert rather than tracking it only here.

## Supported versions

Only the most recent release. Papercut is pre-1.0 in practice; older betas do
not receive fixes.
