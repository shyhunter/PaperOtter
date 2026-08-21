# Papercut

## Your local document toolkit -> private, fast, offline.

<p align="center">
  <img src="docs/screenshots/hero-logo.png" alt="Papercut logo" width="600">
</p>

<p align="center">
  <a href="#download"><img src="https://img.shields.io/badge/-Download-2ea44f?style=for-the-badge" alt="Download"></a>
  <a href="https://github.com/users/shyhunter/projects/9"><img src="https://img.shields.io/badge/-Roadmap-0969da?style=for-the-badge" alt="Roadmap"></a>
  <a href="https://github.com/shyhunter/Papercut/wiki"><img src="https://img.shields.io/badge/-Wiki-8A2BE2?style=for-the-badge" alt="Wiki"></a>
</p>

<br>

---

<p align="center">
  <img src="docs/screenshots/dashboard-dark.png" alt="Papercut dashboard showing PDF, image, and document tools" width="100%">
</p>
<p align="center">
  <img src="docs/screenshots/dashboard-light.png" alt="Papercut dashboard in light mode" width="49%">
  <img src="docs/screenshots/tool-pick-step.png" alt="Compress PDF tool - pick a file to open or drop" width="49%">
</p>

Every tool follows the same four-step flow -- Pick, Configure, Compare, Save
-- and the whole app supports both light and dark mode.

---

## Features

Papercut ships with **21 built-in tools** across three categories -- all running locally on your machine.

### PDF Tools

- 🗜️ **Compress** — Reduce PDF file size using Ghostscript presets
- 📐 **Resize** — Scale pages to standard or custom dimensions
- 🔗 **Merge** — Combine multiple PDFs into one
- ✂️ **Split** — Extract page ranges into separate files
- 🔄 **Rotate** — Rotate individual or all pages
- 🔢 **Page Numbers** — Add page numbers with position/format control
- 💧 **Watermark** — Overlay text or image watermarks
- 🖼️ **Crop** — Trim page margins
- 🗂️ **Organize** — Reorder, delete, or duplicate pages
- ✍️ **Sign** — Add handwritten, typed, or drawn signatures
- ⬛ **Redact** — Permanently remove sensitive content
- 🗄️ **PDF/A** — Convert to archival PDF/A format
- 🛠️ **Repair** — Fix corrupted or damaged PDFs
- 🔒 **Protect** — Add password encryption to PDFs
- 🔓 **Unlock** — Remove password protection from PDFs

### Image Tools

- 🗜️ **Compress** — Reduce image file size with quality control
- 📐 **Resize** — Scale images to specific dimensions
- 🔁 **Convert** — Convert between JPG, PNG, and WebP formats
- 🔄 **Rotate** — Rotate images by any angle

### Document Tools

- 🔀 **Convert** — Turn PDF & DOCX into **Markdown, HTML, JSON, plain text, or DOCX** (structure-preserving, fully offline) — plus PDF, EPUB, MOBI and more
- 📝 **Edit PDF** — Annotate and modify PDF content

> **New in beta.9 — structure-preserving conversion.** Turn PDFs and Word documents into clean **Markdown, HTML, JSON, plain text, or DOCX** entirely on-device — no external tools required. Headings, paragraphs, and lists are preserved. Long documents can be split **by chapter** into a `.zip` with one file per chapter, using the PDF's own bookmarks/outline when available (falling back to detected headings).

---

## Download

<p align="center">
  <a href="https://github.com/shyhunter/Papercut/releases/latest"><img src="https://img.shields.io/github/v/release/shyhunter/Papercut?label=version&style=for-the-badge" alt="Latest version"></a>
</p>

| Platform | Installer | Download |
|----------|-----------|----------|
| **Mac (M1/M2/M3/M4)** | .dmg | [Download](https://github.com/shyhunter/Papercut/releases/latest) |
| **Mac (Intel)** | .dmg | [Download](https://github.com/shyhunter/Papercut/releases/latest) |
| **Windows** | .exe | [Download](https://github.com/shyhunter/Papercut/releases/latest) |
| **Linux (AppImage)** | .AppImage | [Download](https://github.com/shyhunter/Papercut/releases/latest) |
| **Linux (Debian/Ubuntu)** | .deb | [Download](https://github.com/shyhunter/Papercut/releases/latest) |

The links above always point to the latest release on [GitHub Releases](https://github.com/shyhunter/Papercut/releases). Everything you need is included -- just install and go. Ghostscript is bundled with the app.

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
| [LibreOffice](https://www.libreoffice.org/) | DOC, ODT, RTF & PDF-output document conversion | [Download](https://www.libreoffice.org/download/) |
| [Calibre](https://calibre-ebook.com/) | EPUB/MOBI ebook formats | [Download](https://calibre-ebook.com/download) |

Converting to **Markdown, HTML, JSON, plain text, or DOCX** runs entirely in-app and needs none of these. The optional tools are only used for the other document formats above — without them, those specific formats simply aren't offered.

---

## Privacy

**Papercut processes everything on YOUR machine. No uploads, no cloud, no telemetry. Your files never leave your computer.**

All file processing happens locally using native binaries (Ghostscript, LibreOffice, Calibre) and in-app libraries (pdf-lib, pdfjs, mammoth, Sharp). There is no analytics and no tracking, and your documents never leave your machine. Papercut makes two, and only two, network calls, neither of which sends any data about you or your files: on launch, a request to GitHub's public API to check whether a newer version is available; and, only when you open the About dialog, a request to fetch the current feedback contact address from a JSON file on GitHub, so it can be updated without shipping a new release.

---

## Troubleshooting

<details>
<summary>See details</summary>

### Ghostscript issues

Ghostscript ships bundled with Papercut, so PDF compression should work out of
the box. If you see a "Ghostscript is not installed" message or a crash
instead, try:

- **macOS:** `brew install ghostscript`
- **Linux:** `sudo apt install ghostscript` (or your package manager's equivalent)
- **Windows / manual install:** download from [ghostscript.com](https://ghostscript.com/releases/gsdnld.html) and make sure it's on your PATH

If it still crashes with a missing-library error, try reinstalling Papercut
first -- that usually fixes a corrupted bundled copy.

### LibreOffice / Calibre not found

DOC/DOCX conversion and EPUB/MOBI tools need LibreOffice or Calibre installed
and on your PATH. Papercut will show a prompt naming the missing dependency
if one isn't found.

See the [Required Dependencies](https://github.com/shyhunter/Papercut/wiki/Required-Dependencies)
wiki page for full per-platform detail.

### Still stuck?

Check the [Troubleshooting wiki page](https://github.com/shyhunter/Papercut/wiki/Troubleshooting)
for more error messages, or [open an issue](https://github.com/shyhunter/Papercut/issues/new/choose)
and include the exact error message.

</details>

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
| Document Conversion | in-app engine + [mammoth](https://github.com/mwilliamson/mammoth.js) (DOCX) + [fflate](https://github.com/101arrowz/fflate) |
| Image Processing | [Sharp](https://sharp.pixelplumbing.com/) (via Rust sidecar) |
| PDF Compression | [Ghostscript](https://ghostscript.com/) (bundled) |

---

## Acknowledgements

Papercut is built on top of the open-source tools listed in Tech Stack above,
plus optional support for [LibreOffice](https://www.libreoffice.org/) and
[Calibre](https://calibre-ebook.com/) for document/ebook conversion. Thanks
to all their maintainers.

---

## License

[MIT](LICENSE) -- see the LICENSE file for details.

---

## Contributing

Contributions are welcome! Please see the [pull request template](.github/pull_request_template.md) for the submission checklist. Open an issue first for major changes.

---

If Papercut saves you time, consider [buying me a coffee](https://buymeacoffee.com/shyhunter) -- it helps keep development going.
