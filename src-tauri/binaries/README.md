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

- These binaries are in `.gitignore` (too large for git).
- The app falls back to system-installed Ghostscript if the sidecar binary is not found.
- Ensure the binary is executable (`chmod +x`) on macOS/Linux.
