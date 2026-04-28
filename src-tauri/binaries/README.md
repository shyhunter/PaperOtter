# Sidecar Binaries

Papercut bundles Ghostscript as a Tauri sidecar so users don't need to install it separately.

## Binary Naming Convention

Tauri resolves sidecar binaries by target triple. The binary must be named:

```
gs-{target-triple}
```

| Platform          | Binary name                          |
|-------------------|--------------------------------------|
| macOS ARM (M1+)   | `gs-aarch64-apple-darwin`           |
| macOS Intel        | `gs-x86_64-apple-darwin`            |
| Windows 64-bit     | `gs-x86_64-pc-windows-msvc.exe`     |
| Linux 64-bit       | `gs-x86_64-unknown-linux-gnu`       |

## How to Obtain

### macOS (Homebrew)

```bash
brew install ghostscript
cp $(which gs) src-tauri/binaries/gs-aarch64-apple-darwin   # Apple Silicon
cp $(which gs) src-tauri/binaries/gs-x86_64-apple-darwin    # Intel
```

### Windows

1. Download Ghostscript from https://ghostscript.com/releases/gsdnld.html
2. Copy `gswin64c.exe` to `src-tauri/binaries/gs-x86_64-pc-windows-msvc.exe`

### Linux

```bash
sudo apt install ghostscript   # or equivalent for your distro
cp $(which gs) src-tauri/binaries/gs-x86_64-unknown-linux-gnu
```

## Notes

- The macOS ARM binary is `.gitignore`d (too large for git). The other three (`gs-x86_64-apple-darwin`, `gs-x86_64-pc-windows-msvc.exe`, `gs-x86_64-unknown-linux-gnu`) are committed as **placeholder stubs** so Tauri's `externalBin` check passes; the real per-platform binary is built/installed by CI or `cargo tauri build`.
- The app falls back to system-installed Ghostscript if the sidecar binary is not found.
- Ensure the binary is executable (`chmod +x`) on macOS/Linux.

## Provenance & Verification (project rule P012)

Sidecar binaries run with the host app's privileges — a compromised binary = full RCE on every user machine. We document source + SHA-256 so each install can be verified.

### Source

| Platform | Upstream source |
|---|---|
| macOS (Homebrew) | `brew install ghostscript` — formula: https://formulae.brew.sh/formula/ghostscript |
| Windows | https://ghostscript.com/releases/gsdnld.html (official AGPL release) |
| Linux | distro package manager (`apt`, `dnf`, etc.) |

### Verify your local binary

After installing, compare the SHA-256:

```bash
shasum -a 256 src-tauri/binaries/gs-aarch64-apple-darwin
# expected (Homebrew ghostscript ≈ 10.x on macOS arm64):
#   bd8bb465e572652647eb517862301ac51556e058b4025f9e28e9433f98a04a43
```

If the SHA differs, you are running a different Ghostscript version or build. Update this table when you upgrade so other contributors can verify against a known-good hash.

### Update the SHA when you upgrade

```bash
# After installing a new gs version:
shasum -a 256 src-tauri/binaries/gs-aarch64-apple-darwin > /tmp/gs-sha.txt
# Then update this README with the new value + the upstream version (gs --version).
```

### License note (not security, but worth knowing)

Ghostscript is dual-licensed (AGPL or commercial). Bundling it in a proprietary distribution requires a commercial license from Artifex. Using it in an open-source AGPL-compatible project is fine. Confirm Papercut's distribution model matches.
