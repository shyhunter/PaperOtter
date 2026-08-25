# Page number colour, and removable page numbers

**Date:** 2026-08-25
**Status:** Approved

## Problem

Page numbers are always black, and in the PDF editor they cannot be taken back
off once applied.

Two surfaces add page numbers today:

| Surface | Behaviour | Can the user change their mind? |
|---|---|---|
| `PageNumbersFlow` (standalone tool) | Pick → Configure → Save; keeps the original bytes | Yes — "Back" already discards |
| `PageNumbersPanel` (PDF editor) | `handleApply` overwrites `state.pdfBytes` | **No** — `EditorContext` has no undo of any kind |

Applying twice in the editor bakes in two overlapping sets of numbers, with no
way back.

## Constraint that shapes the design

Once numbers are drawn into a content stream they are ordinary text,
indistinguishable from the document's own content. There is no reliable way to
find and strip them afterwards. "Remove" therefore has to mean *keep something
to go back to*, not *detect and delete*.

Snapshots are not free: this project handles 31 MB PDFs, so every retained copy
costs that much memory. The design keeps exactly one.

## Design

### 1. Colour in the core library

`PageNumberOptions` gains `color: string` — a `#RRGGBB` hex string, defaulting
to `#000000` so existing behaviour is unchanged. A `hexToRgb` helper converts to
pdf-lib's `rgb()` at draw time.

Hex rather than `{ r, g, b }`: it is exactly what `<input type="color">` emits
and accepts, it compares trivially in tests, and it serialises if presets are
ever persisted.

**Included cleanup:** `addPageNumbers` and `addPageNumbersSinglePage` currently
duplicate the whole position and text-width calculation — the same switch
statement twice. Threading colour through would mean editing both copies, and
they would drift, making the preview disagree with the output. Both will call a
shared `computeNumberPlacement(page, text, options)`.

### 2. Shared colour control

`src/components/PageNumberColorPicker.tsx`, used by both surfaces.

- Presets: Black `#000000`, White `#FFFFFF`, Grey `#808080`, Red `#DC2626`,
  Blue `#2563EB`
- A native `<input type="color">` for anything else
- Props: `value: string`, `onChange: (hex: string) => void`

The White swatch needs an explicit border, or it is an invisible button on a
light UI. White numbers are likewise invisible on a white page; the existing
live preview already shows this, so no extra warning is added.

**To verify before building on it:** that `<input type="color">` opens the
system picker in macOS WKWebView. Fallback is a hex text field.

### 3. Removable page numbers in the editor

The panel derives from a snapshot rather than from the current bytes:

- First enable records `baseBytes = state.pdfBytes` in `EditorContext`
- Every option or colour change re-derives from `baseBytes` — changes **replace**
  rather than stack
- Unticking restores `baseBytes`
- Memory stays flat at 2x file size however many times options change

**Sharp edge:** if another tool applies while numbers are on, `baseBytes` no
longer contains that tool's work, and restoring it would silently destroy the
edit. So: page numbers stay removable until another tool is applied, or the file
is saved. `updatePdfBytes` clears the base by default; the page-numbers panel
passes an explicit flag to preserve it.

This is the first state `EditorContext` holds on behalf of one specific tool,
which is why the clearing rule is explicit rather than implied.

### Scope

| | Colour | On/off toggle |
|---|---|---|
| Standalone tool | Yes | No — the tool's only job is adding numbers, and Back already covers it |
| Editor panel | Yes | Yes |

## Testing

TDD per P010 — failing test first, confirmed red.

- **Library:** colour reaches both draw paths; hex conversion; `#000000`
  default preserves current output
- **Component:** swatch selection; White renders distinguishably; custom picker
  propagates
- **Editor:** unticking restores byte-identical original; changing colour twice
  produces one set of numbers, not two; applying another tool ends removability

Fixtures use the committed `test-fixtures/sample.pdf` per P007. Test IDs are
added to `.planning/TEST_PLAN.md` per P008.

## Rejected alternatives

- **Detect and strip existing numbers** — unreliable by construction; drawn text
  is indistinguishable from document content.
- **General undo history for all 11 editor tools** — larger than the request,
  and costs N x file size; 31 MB PDF with 5 edits is 155 MB.
- **One-level "Undo apply" button** — does not match "deselect", and applying
  twice still stacks two sets of numbers with only the second removable.

## Security notes

No secrets, no network, no new dependency; all processing stays local via
pdf-lib, as today. The colour value is written into a PDF content stream, so it
is validated as `#RRGGBB` and converted numerically rather than interpolated as
text — a hex string reaching the content stream unvalidated would be a content
injection path. The retained snapshot lives in memory only, is never written to
disk, and is dropped on save or when another tool applies; it holds the same
document the user already opened, so it adds no new exposure beyond memory
footprint.
