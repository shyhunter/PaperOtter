# Sidecar Binaries

Papercut bundles Ghostscript as a Tauri sidecar so users do not have to install
anything to compress, protect, unlock, repair or PDF/A-convert a document.

## Status

| Target | Bundled | Self-contained | Notes |
|---|---|---|---|
| `gs-aarch64-apple-darwin` | ✅ real binary | ✅ verified | Built by `scripts/build_ghostscript_sidecar.sh` |
| `gs-x86_64-apple-darwin` | ❌ stub | — | Prints a message and exits 1 |
| `gs-x86_64-pc-windows-msvc.exe` | ❌ stub | — | Prints a message and exits 1 |
| `gs-x86_64-unknown-linux-gnu` | ❌ stub | — | Prints a message and exits 1 |

On a target with a stub, `spawn_gs` falls back to a system-installed Ghostscript
via PATH, and `is_ghostscript_available` reports the tool unavailable if there is
none, so the user gets a per-platform install hint rather than a broken tool.

## Do not use a package manager's binary directly

The binary this repo shipped until 2026-08-26 was copied straight from Homebrew.
It referenced **eleven** Homebrew libraries by absolute path:

```
/opt/homebrew/opt/jbig2dec/lib/libjbig2dec.0.dylib
/opt/homebrew/opt/libtiff/lib/libtiff.6.dylib
/opt/homebrew/opt/freetype/lib/libfreetype.6.dylib
…
```

`/opt/homebrew` exists only on a machine with Homebrew and those exact packages.
So the "bundled" Ghostscript ran on a developer's machine and essentially nowhere
else — PDF compression was broken for real users on **all four** platforms, three
by stub and one by missing libraries. The symptom is a dyld error, and
`format_gs_crash_error` still carries a branch for it, which is how we know it
was hit in the wild and answered with a better error message rather than a fix.

**Always build with `scripts/build_ghostscript_sidecar.sh`.** It configures
without any `--with-system-*` option, so Ghostscript links its bundled copies of
jpeg, libpng, zlib, freetype, lcms2, jbig2dec, openjpeg and libtiff, and it
**refuses to install a binary that is not self-contained** — the check that would
have caught the original problem.

## Provenance & Verification (project rule P012)

Sidecar binaries run with the host app's privileges — a compromised binary is
full RCE on every user machine. Source and SHA-256 are recorded so any build can
be verified.

| Item | Value |
|---|---|
| Version | Ghostscript 10.06.0 |
| Source | https://github.com/ArtifexSoftware/ghostpdl-downloads/releases/tag/gs10060 |
| Source tarball SHA-256 | `5bd6da34794928cc7e616f288e32bd0be7f9a5ca2d3c206a0af2c19a4e3a318f` |
| Build | `./configure --without-x --disable-cups --disable-dbus --without-tesseract` |
| Patches applied | none |
| `gs-aarch64-apple-darwin` SHA-256 | `a4dc57a388bb3f3a00f51d2e8ad6ab4850fe33581956bd7412ca6b1956dd43fc` |
| Size | 26 MB |

Verify a checkout with:

```bash
shasum -a 256 src-tauri/binaries/gs-aarch64-apple-darwin
otool -L src-tauri/binaries/gs-aarch64-apple-darwin | grep -v '/usr/lib\|/System'   # must be empty
```

## Licence

Ghostscript 10.06.0 is **AGPL-3.0**, not MIT. Distributing it obliges us to offer
its corresponding source. See `THIRD-PARTY-LICENSES.md` at the repo root. No
patches are applied, so the upstream tarball above is that source.

## Remaining platforms

The same script produces the other three targets, but each must be built **on**
(or cross-compiled for) that platform:

- `gs-x86_64-apple-darwin` — build on an Intel Mac, or under Rosetta with an
  x86_64 toolchain.
- `gs-x86_64-unknown-linux-gnu` — build in a glibc container matching the oldest
  supported distro.
- `gs-x86_64-pc-windows-msvc.exe` — Artifex publishes a self-contained Windows
  binary; verify its SHA-256 against ghostscript.com and record it here rather
  than rebuilding.

Until each is done and verified self-contained, leave the stub in place: a stub
falls back to the user's own Ghostscript, whereas a broken binary does not.

## Binary Naming Convention

Tauri resolves sidecars by target triple — the file must be named `gs-{triple}`.
