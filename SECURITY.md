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
  design. Two outbound URLs are allow-listed — the GitHub releases endpoint for
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

## Supported versions

Only the most recent release. Papercut is pre-1.0 in practice; older betas do
not receive fixes.
