# Changelog

All notable changes to Papercut will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0-beta.6] - 2026-04-27

### Fixed
- Windows smoke test in release pipeline: binary search now looks for both `Papercut.exe` and `tauri-app.exe` (Cargo package name) across all install roots (`LOCALAPPDATA`, `ProgramFiles`, `ProgramFiles(x86)`, `APPDATA`) with depth 5; adds diagnostic listing when binary is not found

## [1.0.0-beta.5] - 2026-04-27

### Added
- Version consistency check script (`npm run version:check`) — validates that `package.json`, `tauri.conf.json`, `Cargo.toml`, and all UI version fallbacks agree; also validates git tag on release builds
- 9 automated tests for version consistency (VC-01..04) in CI
- Automated per-platform smoke tests in release pipeline (ST-01..04): macOS arm64, macOS x64, Windows x64, Linux x64 — each platform's release artifact is downloaded, launched, and verified before the release goes live
- Version displayed in bundle metadata is now asserted against the release tag (macOS `Info.plist`, Windows `ProductVersion`)
- Release is auto-published only after all 4 platform smoke tests pass

### Fixed
- Dynamic version display in Dashboard, SplashScreen, and AboutDialog (was hardcoded to `v1.0.0-beta.1`)
- `Cargo.toml` version was drifted to `beta.3` — corrected to track alongside all other version files

## [1.0.0-beta.4] - 2026-04-27

### Fixed
- TypeScript error in `App.tsx`: `offset`/`len` options removed from `readFile` call — these are not part of `ReadFileOptions` in `@tauri-apps/plugin-fs` v2; the file is now read normally and the header bytes are sliced client-side
- TypeScript error in `pdfProcessor.test.ts`: removed unused `typedArgs` variable that caused `TS6133` warning

## [1.0.0-beta.3] - 2026-03-25

### Fixed
- PDF edit view not showing pages after 5th page (#9)
- Header and side menus disappearing when scrolling PDF in edit mode (#8)
- Unsaved-changes confirmation dialog when leaving Edit PDF mode (#7)
- Watermark before/after preview freezing UI on large PDFs (#10)
- Critical and high security issues from security audit

### Added
- Integration test coverage for all PDF editor features (#11)
- Smart path-based E2E triggering for PR checks
- Embedded feedback token for zero-friction tester experience

### Changed
- Fast PR CI architecture with Rust integration tests (build time reduced from 11+ min to < 5 min)
- Renamed repository to Papercut with all references updated
- CI jobs split into parallel validation for faster feedback (#12)

## [1.0.0-beta.2] - 2026-03-19

*(Release automation and download link improvements — no functional changes)*

## [1.0.0-beta.1] - 2026-03-16

### Added

**PDF Tools (15 tools)**
- Compress PDFs using Ghostscript presets (screen, ebook, printer, prepress)
- Resize PDF pages to standard or custom dimensions
- Merge multiple PDFs into a single document
- Split PDFs by page ranges
- Rotate individual or all pages
- Add page numbers with configurable position and format
- Overlay text or image watermarks
- Crop page margins
- Organize pages (reorder, delete, duplicate)
- Sign PDFs with handwritten, typed, or drawn signatures
- Redact sensitive content (permanent removal via render-to-image)
- Convert to PDF/A archival format
- Repair corrupted or damaged PDFs
- Protect PDFs with password encryption
- Unlock password-protected PDFs

**Image Tools (4 tools)**
- Compress images with quality control (JPG, PNG, WebP)
- Resize images to specific dimensions
- Convert between JPG, PNG, and WebP formats
- Rotate images by any angle

**Document Tools (2 tools)**
- Convert between PDF, DOCX, EPUB, MOBI, and other formats (via LibreOffice/Calibre)
- Edit and annotate PDF content

**Architecture and UX**
- Privacy-first design: all processing happens locally, no network calls, no telemetry
- Tauri v2 desktop app with React 19 and TypeScript
- Dark and light theme support
- Dashboard with tool picker and drag-and-drop file input
- Side-by-side comparison view with before/after preview
- File size validation and processing cancellation support
- Error boundaries with recovery actions
- Comprehensive E2E test suite using WebDriverIO and Tauri Driver
- Content Security Policy hardening
- Input sanitization and path traversal protection
