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

## Bundled Linux system libraries (AppImage only)

The Linux **AppImage** bundles roughly 110 unmodified system libraries from
Ubuntu so it can run without those packages being installed. This includes the
WebKitGTK stack Papercut's user interface runs on, and much of GTK, GLib,
Pango, Cairo and GStreamer beneath it. Many of these are licensed under the
**GNU LGPL**, versions 2.1 or 3, and a few are dual GPL/LGPL.

Papercut modifies none of them. They are the stock Ubuntu binaries, linked
dynamically, and they can be replaced inside the extracted AppImage.

**Where the notices are.** Each bundled package carries its own Debian
copyright file inside the AppImage, at:

```
usr/share/doc/<package>/copyright
```

Extract the AppImage with `./Papercut_*.AppImage --appimage-extract` to read
them. Debian copyright files normally point at `/usr/share/common-licenses/`,
which does not exist inside an AppImage, so those references would otherwise
dangle. Every licence text they refer to is therefore installed alongside the
application at `usr/lib/Papercut/licenses/`:

```
Apache-2.0  Artistic-1.0  CC0-1.0  GFDL-1.2  GFDL-1.3  GPL-1.0  GPL-2.0
GPL-3.0     LGPL-2.0      LGPL-2.1  LGPL-3.0  MPL-1.1   MPL-2.0
```

That set was derived from the artifact itself rather than guessed: every
`common-licenses/` reference in the bundled copyright files was collected and
each one is covered above. Debian's unversioned `GPL`, `LGPL` and `GFDL`
pointers resolve to the newest versioned text, which is present.

**Source code offer.** Every bundled library is a stock package from the Ubuntu
archive. Complete corresponding source for any of them can be obtained with:

```
apt-get source <package>
```

or from https://archive.ubuntu.com/ubuntu/pool/ . If you cannot obtain the
source for a bundled library by those means, open an issue on the Papercut
repository and we will provide it.

**The `.deb` and the other platforms are not affected.** The Debian package
declares these libraries as dependencies rather than shipping them, so nothing
is redistributed there. macOS uses the system WKWebView, and the Windows build
uses Microsoft's WebView2 runtime, which its own installer obtains; neither
redistributes anything.

### A note on the webkit2gtk entries in NOTICES.txt

`NOTICES.txt` lists `webkit2gtk` and `webkit2gtk-sys` as MIT. Those are the
**Rust binding crates**, and they are MIT. The WebKitGTK library itself, which
the AppImage bundles, is **LGPL-2.1-or-later** and is covered by this section,
not by those entries.

---

## Apple system frameworks

Vision, PDFKit, Core Graphics, Core Text and Image I/O are part of macOS and are
used through public APIs. Nothing is redistributed.
