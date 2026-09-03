#!/usr/bin/env bash
# Builds a SELF-CONTAINED Ghostscript sidecar for Papercut.
#
# Why not use a package manager's binary: Homebrew (and most distro) builds link
# against the package manager's own shared libraries by absolute path. The
# binary this repo shipped before carried eleven such references into
# /opt/homebrew/..., so it ran only on machines that already had Homebrew and
# those exact libraries — that is, on a developer's machine and almost nowhere
# else. PDF compression was broken for real users.
#
# Ghostscript's source tree bundles jpeg, libpng, zlib, freetype, lcms2,
# jbig2dec, openjpeg and libtiff. Configuring WITHOUT the --with-system-*
# options links them statically and yields a binary that depends only on
# /usr/lib and /System, which are always present.
#
# Usage:  scripts/build_ghostscript_sidecar.sh [target-triple]
# Default target: the host triple.
#
# Licence: Ghostscript is AGPL-3.0. See THIRD-PARTY-LICENSES.md — shipping the
# binary carries an obligation to offer its corresponding source. This script
# applies no patches, so the upstream tarball below IS that source.
set -euo pipefail

GS_VERSION="10.06.0"
GS_TAG="gs10060"
GS_SHA256="5bd6da34794928cc7e616f288e32bd0be7f9a5ca2d3c206a0af2c19a4e3a318f"
GS_URL="https://github.com/ArtifexSoftware/ghostpdl-downloads/releases/download/${GS_TAG}/ghostscript-${GS_VERSION}.tar.gz"

TARGET="${1:-$(rustc -vV | awk '/^host:/ {print $2}')}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${REPO_ROOT}/src-tauri/binaries/papercut-gs-${TARGET}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "==> Downloading Ghostscript ${GS_VERSION}"
curl -sSL --max-time 600 -o "${WORK}/gs.tar.gz" "$GS_URL"

echo "==> Verifying checksum (P012)"
ACTUAL="$(shasum -a 256 "${WORK}/gs.tar.gz" | awk '{print $1}')"
if [ "$ACTUAL" != "$GS_SHA256" ]; then
  echo "CHECKSUM MISMATCH" >&2
  echo "  expected: $GS_SHA256" >&2
  echo "  actual:   $ACTUAL" >&2
  echo "Refusing to build from an unverified source tarball." >&2
  exit 1
fi

echo "==> Building (no --with-system-* : deps are linked from the source tree)"
tar xzf "${WORK}/gs.tar.gz" -C "$WORK"
cd "${WORK}/ghostscript-${GS_VERSION}"
./configure --without-x --disable-cups --disable-dbus --without-tesseract \
            --prefix="${WORK}/install" > "${WORK}/configure.log" 2>&1
make -j"$(getconf _NPROCESSORS_ONLN 2>/dev/null || echo 4)" > "${WORK}/make.log" 2>&1

echo "==> Verifying the result is actually self-contained"
if [ "$(uname)" = "Darwin" ]; then
  EXTERNAL="$(otool -L bin/gs | grep -vE '^\s*/usr/lib|^\s*/System|:$' || true)"
else
  EXTERNAL="$(ldd bin/gs | grep -vE 'linux-vdso|/lib/|/usr/lib/|ld-linux' || true)"
fi
if [ -n "$EXTERNAL" ]; then
  echo "NOT self-contained — these would be missing on a clean machine:" >&2
  echo "$EXTERNAL" >&2
  exit 1
fi

bin/gs --version > /dev/null
install -m 755 bin/gs "$OUT"

echo "==> Done"
echo "    $OUT"
echo "    sha256: $(shasum -a 256 "$OUT" | awk '{print $1}')"
echo
echo "Record that hash in src-tauri/binaries/README.md (rule P012)."
