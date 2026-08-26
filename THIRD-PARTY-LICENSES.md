# Third-Party Licences

Papercut itself is MIT licensed (see `LICENSE`). It bundles and invokes the
following third-party software. This file records what is shipped, under what
licence, and how to obtain the corresponding source.

---

## Ghostscript

- **Version:** 10.06.0
- **Copyright:** © 2025 Artifex Software, Inc.
- **Licence:** GNU Affero General Public License v3.0 (AGPL-3.0)
- **Upstream:** https://www.ghostscript.com/
- **Source download:** https://github.com/ArtifexSoftware/ghostpdl-downloads/releases/tag/gs10060

Used for: PDF compression, PDF/A conversion, password protect/unlock, and repair.
Papercut invokes Ghostscript as a **separate process** via its command-line
interface. It does not link against Ghostscript, and no Ghostscript code is
incorporated into Papercut's own source.

### Your rights under the AGPL

The Ghostscript binary distributed with Papercut is covered by the AGPL, not by
Papercut's MIT licence. You are entitled to the complete corresponding source
code for it. That source is the unmodified upstream release linked above; the
exact build configuration Papercut uses is recorded in
`src-tauri/binaries/README.md` so the binary can be reproduced.

Papercut applies no patches to Ghostscript.

### Note on commercial use

Artifex dual-licenses Ghostscript: AGPL, or a commercial licence. If Papercut is
ever distributed under terms incompatible with the AGPL, or embedded in a
proprietary product, a commercial licence from Artifex would be required. Under
Papercut's current MIT/open-source distribution, shipping the binary alongside
this notice and the source offer above is the compliance path being relied on.

**This is a statement of intent, not legal advice.** If Papercut's licensing or
commercial position changes, this arrangement needs a lawyer's eye.

---

## Calibre (not bundled)

Used optionally for ebook conversion, invoked as a separate process if the user
has installed it. Papercut does not distribute Calibre. Calibre is GPL-3.0;
see https://calibre-ebook.com/.

## LibreOffice (not bundled)

Used optionally for document conversion, invoked as a separate process if the
user has installed it. Papercut does not distribute LibreOffice. LibreOffice is
MPL-2.0; see https://www.libreoffice.org/.

---

## Apple system frameworks

Vision, PDFKit, Core Graphics, Core Text and Image I/O are part of macOS and are
used through public APIs. Nothing is redistributed.
