# Changelog

All notable changes to Papercut will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
