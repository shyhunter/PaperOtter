# Sidecar Binaries

Papercut bundles Ghostscript as a Tauri sidecar so users do not have to install
anything to compress, protect, unlock, repair or PDF/A-convert a document.

## Status

The goal is that **no user has to install anything**, on any operating system.

| Target | How it is produced | Self-contained | Actually run on that platform |
|---|---|---|---|
| `papercut-gs-aarch64-apple-darwin` | committed; `scripts/build_ghostscript_sidecar.sh` | verified by `otool` | yes |
| `papercut-gs-x86_64-apple-darwin` | committed; cross-compiled `clang -arch x86_64` | verified by `otool` | yes, under Rosetta |
| `papercut-gs-x86_64-unknown-linux-gnu` | committed; built in a `linux/amd64` container | verified by `ldd` | yes, in a clean `ubuntu:22.04` container |
| `papercut-gs-x86_64-pc-windows-msvc.exe` | fetched in CI from Artifex's installer | n/a — needs `gsdll64.dll` | **not yet** |

Three of the four are committed because they were built and tested here. Linux is
arguably the best-verified of them: it was built in a `linux/amd64` container and
then run in a *clean* `ubuntu:22.04` container with no Ghostscript installed,
which is closer to a real user's machine than testing macOS binaries on a
developer Mac that has Homebrew.

Windows is the exception. Its Ghostscript ships as an installer containing an exe
plus a DLL, and it cannot be built or extracted from macOS, so it is fetched on
the Windows runner at release time.

Any target still carrying a stub falls back to a system-installed Ghostscript via
PATH, and `is_ghostscript_available` reports the tool unavailable if there is
none, so the user gets a per-platform install hint rather than a broken tool.

### Windows needs a real test before it can be claimed

Windows Ghostscript is **not one file**: `gswin64c.exe` is a thin wrapper around
`gsdll64.dll` and will not start without it. A Tauri sidecar is a single file, and
resources bundle into a different directory than the executable, so:

- `gsdll64.dll` ships as a Windows-only resource (`tauri.windows.conf.json`), and
- `with_windows_dll_path` in `lib.rs` prepends the resource directory to the child
  process's `PATH` before spawning.

The *build* job cannot catch a failure here: there the exe and DLL sit in the
same folder, so Ghostscript runs whatever happens. The interesting failure only
exists after installation, where the sidecar lands beside `Papercut.exe` and the
DLL under `resources\`.

So the **smoke-test** job checks it instead. That job already installs the NSIS
package on a Windows runner, so it works against the real installed layout: it
locates the installed `gs.exe` and `gsdll64.dll`, prepends the DLL's directory to
`PATH` exactly as `with_windows_dll_path` does, and has Ghostscript produce a PDF
through the same `pdfwrite` device compression uses. The release fails if the
sidecar is missing, the DLL is missing, Ghostscript will not start, or the output
is not a PDF.

**This has not run yet** — it executes on the next release tag. Until that run is
green, Windows is implemented but unproven, and should not be described as
installation-free. What it still does not cover is the app driving Ghostscript
through its own UI; that would need WebDriver, which this project deliberately
dropped from CI on cost grounds.

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
| Source tarball SHA-512 | matches Artifex's published `SHA512SUMS` for `gs10060` (verified 2026-08-26) |
| `papercut-gs-aarch64-apple-darwin` SHA-256 | `a4dc57a388bb3f3a00f51d2e8ad6ab4850fe33581956bd7412ca6b1956dd43fc` (26 MB) |
| `papercut-gs-x86_64-apple-darwin` SHA-256 | `a79b950f6afa9eff24280939e4fad378322e356bc48fa50bed4ded5155d6ca96` (27 MB) |
| `papercut-gs-x86_64-unknown-linux-gnu` SHA-256 | `4dd99daf72a1dbc83b250d4eff3c60a1a6c0fcc6e422e96d50991782f89b5a42` (28 MB) |
| Windows installer SHA-256 | `8d552205c0fe87a16bac2f377c8a1b090cfcbc610db7c281bd6a646b39c9c468`, pinned in `release.yml`; its SHA-512 matches Artifex's published sums |

Verify a checkout with:

```bash
shasum -a 256 src-tauri/binaries/papercut-gs-aarch64-apple-darwin
otool -L src-tauri/binaries/papercut-gs-aarch64-apple-darwin | grep -v '/usr/lib\|/System'   # must be empty
```

## Licence

Ghostscript 10.06.0 is **AGPL-3.0**, not MIT. Distributing it obliges us to offer
its corresponding source. See `THIRD-PARTY-LICENSES.md` at the repo root. No
patches are applied, so the upstream tarball above is that source.

## Reproducing the committed macOS binaries

```bash
scripts/build_ghostscript_sidecar.sh                       # host arch
scripts/build_ghostscript_sidecar.sh x86_64-apple-darwin   # Intel, cross-compiled
```

The script verifies the source tarball's SHA-256 before building and refuses to
install a binary that is not self-contained.

### Reproducing the Linux binary

```bash
docker run --rm --platform linux/amd64 -v "$PWD":/work -w /work ubuntu:22.04 bash -c '
  apt-get update -qq && apt-get install -y -qq build-essential
  tar xzf ghostscript-10.06.0.tar.gz && cd ghostscript-10.06.0
  ./configure --without-x --disable-cups --disable-dbus --without-tesseract
  make -j"$(nproc)" && ldd bin/gs'
```

## Release-time steps

`.github/workflows/release.yml` fetches Windows Ghostscript on the Windows runner
before `tauri build`, verifying the installer's SHA-256 first (P012), and fails
the release on **any** platform whose sidecar is under 1 MB — the signal that a
placeholder stub is about to ship, which would silently push the Ghostscript
install back onto the user.

## Binary Naming Convention

Tauri resolves sidecars by target triple — the file must be named `papercut-gs-{triple}`.
