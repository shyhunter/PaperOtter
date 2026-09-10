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

## qpdf (compiled in, not a separate binary)

- **Version:** 12.4.0, vendored by the `qpdf` Rust crate (`qpdf-sys` 0.3.6)
- **Copyright:** © Jay Berkenbilt
- **Licence:** Apache License 2.0
- **Upstream:** https://github.com/qpdf/qpdf

Used for: repairing damaged PDFs. Unlike Ghostscript, qpdf is **statically linked
into the Papercut binary** rather than shipped as a separate executable — there is
no sidecar file and no companion DLL on Windows.

Apache-2.0 is permissive: it carries no copyleft, so it places no licence
requirement on Papercut's own MIT source, and it would place none on a commercial
release either. Its obligations are to keep the licence and attribution, which
this file and `LICENSES/Apache-2.0.txt` do.

### Libraries vendored inside qpdf-sys and compiled with it

The crate builds two C libraries from its own source tree, so their code is in
the shipped binary too and their notices are owed:

- **zlib 1.3.1** — © 1995-2024 Jean-loup Gailly and Mark Adler, under the zlib
  licence. Permissive; requires the copyright notice not be misrepresented and
  altered versions be marked as such. Papercut alters nothing.
- **libjpeg (Independent JPEG Group) 9f** — © 1991-2024 Thomas G. Lane, Guido
  Vollbeding. The IJG licence requires, for distribution of executable code:

  > **This software is based in part on the work of the Independent JPEG Group.**

  That statement is made here, and this file ships inside the installer as
  `licenses/THIRD-PARTY-LICENSES.md` (see `externalBin`/`resources` in
  `src-tauri/tauri.conf.json`), which is what makes it accompanying
  documentation rather than a note in the repository. It is deliberately not
  added to `LICENSES/NOTICES.txt`: that file is generated from lockfile
  metadata, which knows nothing about C sources vendored inside a crate, so a
  hand-written line there would be erased by the next `notices` run.

Neither is separately downloadable from Papercut because neither is a separate
artifact: both are compiled into the same binary as the Rust code.

## Signature fonts (bundled)

Three handwriting faces are bundled as `woff2` in `src/assets/fonts/` and used by
the Sign PDF tool's typed-signature option. They ship inside the application, so
their licence and copyright notices travel with them:

| Font | Copyright | Licence |
|---|---|---|
| Caveat | © 2014 The Caveat Project Authors — https://github.com/googlefonts/caveat | OFL-1.1 |
| Dancing Script | © 2016 The Dancing Script Project Authors — https://github.com/googlefonts/DancingScript, with Reserved Font Name 'Dancing Script' | OFL-1.1 |
| Great Vibes | © 2015 The Great Vibes Pro Project Authors — https://github.com/googlefonts/great-vibes | OFL-1.1 |

The SIL Open Font License 1.1 text is in `LICENSES/OFL-1.1.txt` and ships with the
installer. The OFL permits bundling, embedding in documents, and commercial use;
its conditions are that the copyright and licence notice travel with the fonts
(above), that the fonts are not sold on their own, and that a *modified* version
must be renamed. Papercut modifies none of them and sells none of them.

Note on the Reserved Font Name: it binds only a modified derivative, which is why
"Dancing Script" may be named here and rendered in the interface.

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
