# Papercut

**Your local document toolkit -- private, fast, offline.**

[![Version](https://img.shields.io/github/v/release/shyhunter/Papercut?label=version)](https://github.com/shyhunter/Papercut/releases)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![macOS](https://img.shields.io/badge/macOS-Apple%20Silicon%20%7C%20Intel-black)](https://github.com/shyhunter/Papercut/releases)
[![Windows](https://img.shields.io/badge/Windows-x64-blue)](https://github.com/shyhunter/Papercut/releases)
[![Linux](https://img.shields.io/badge/Linux-x64-orange)](https://github.com/shyhunter/Papercut/releases)

<!-- TODO: Add hero screenshot -->

---

## Features

Papercut ships with **21 built-in tools** across three categories -- all running locally on your machine.

### PDF Tools

| Tool | Description |
|------|-------------|
| Compress | Reduce PDF file size using Ghostscript presets |
| Resize | Scale pages to standard or custom dimensions |
| Merge | Combine multiple PDFs into one |
| Split | Extract page ranges into separate files |
| Rotate | Rotate individual or all pages |
| Page Numbers | Add page numbers with position/format control |
| Watermark | Overlay text or image watermarks |
| Crop | Trim page margins |
| Organize | Reorder, delete, or duplicate pages |
| Sign | Add handwritten, typed, or drawn signatures |
| Redact | Permanently remove sensitive content |
| PDF/A | Convert to archival PDF/A format |
| Repair | Fix corrupted or damaged PDFs |
| Protect | Add password encryption to PDFs |
| Unlock | Remove password protection from PDFs |

### Image Tools

| Tool | Description |
|------|-------------|
| Compress | Reduce image file size with quality control |
| Resize | Scale images to specific dimensions |
| Convert | Convert between JPG, PNG, and WebP formats |
| Rotate | Rotate images by any angle |

### Document Tools

| Tool | Description |
|------|-------------|
| Convert | Convert between PDF, DOCX, EPUB, MOBI, and more |
| Edit PDF | Annotate and modify PDF content |

---

## Privacy

**Papercut processes everything on YOUR machine. No uploads, no cloud, no telemetry. Your files never leave your computer.**

All file processing happens locally using native binaries (Ghostscript, LibreOffice, Calibre) and in-app libraries (pdf-lib, Sharp). There is no analytics and no tracking, and your documents never leave your machine. The one exception: on launch, Papercut makes a single request to GitHub's public API to check whether a newer version is available — no data about you or your files is sent, and this is the only network call the app ever makes.

---

## Install

Download the latest release for your platform:

| Platform | Installer | Download |
|----------|-----------|----------|
| **Mac (M1/M2/M3/M4)** | .dmg | [Download](https://github.com/shyhunter/Papercut/releases/latest) |
| **Mac (Intel)** | .dmg | [Download](https://github.com/shyhunter/Papercut/releases/latest) |
| **Windows** | .exe | [Download](https://github.com/shyhunter/Papercut/releases/latest) |
| **Linux (AppImage)** | .AppImage | [Download](https://github.com/shyhunter/Papercut/releases/latest) |
| **Linux (Debian/Ubuntu)** | .deb | [Download](https://github.com/shyhunter/Papercut/releases/latest) |

Everything you need is included -- just install and go. Ghostscript is bundled with the app.

> **Mac users:** If you see _"Papercut is damaged and can't be opened"_, open **Terminal** and run:
> ```
> xattr -cr /Applications/Papercut.app
> ```
> Then open Papercut normally. This happens because the app is not yet signed with an Apple Developer certificate.

> **Windows users:** If you see _"Windows protected your PC"_ (a SmartScreen warning), click **More info**, then **Run anyway**. This happens because the app is not yet signed with a Windows code-signing certificate — it's a cost/trust step still on the roadmap, not a sign of a problem with the installer.

### Optional Dependencies

Most tools work out of the box. These are only needed for specific features:

| Dependency | Used For | Install |
|------------|----------|---------|
| [LibreOffice](https://www.libreoffice.org/) | DOC/DOCX conversion | [Download](https://www.libreoffice.org/download/) |
| [Calibre](https://calibre-ebook.com/) | EPUB/MOBI ebook formats | [Download](https://calibre-ebook.com/download) |

Without these, the corresponding tools will show a prompt to install the missing dependency.

---

## Development

```bash
# Install dependencies
npm install

# Start development server (Tauri + Vite)
npm run tauri dev

# Run tests
npm run test

# Type check
npx tsc --noEmit

# Lint
npm run lint
```

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Rust](https://rustup.rs/) (stable)
- [Tauri CLI](https://v2.tauri.app/start/prerequisites/)

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| App Shell | [Tauri v2](https://v2.tauri.app/) |
| Frontend | [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) |
| Styling | [Tailwind CSS v4](https://tailwindcss.com/) |
| PDF Processing | [pdf-lib](https://pdf-lib.js.org/) + [pdfjs-dist](https://mozilla.github.io/pdf.js/) |
| Image Processing | [Sharp](https://sharp.pixelplumbing.com/) (via Rust sidecar) |
| PDF Compression | [Ghostscript](https://ghostscript.com/) (bundled) |

---

## License

[MIT](LICENSE) -- see the LICENSE file for details.

---

## Contributing

Contributions are welcome! Please see the [pull request template](.github/pull_request_template.md) for the submission checklist. Open an issue first for major changes.

---

If Papercut saves you time, consider [buying me a coffee](https://buymeacoffee.com/shyhunter) -- it helps keep development going.
