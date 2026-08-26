/**
 * Real output from Apple Vision on test-fixtures/scanned.pdf, captured verbatim.
 *
 * Regenerate with:
 *   cd src-tauri && cargo test --lib dump_real_ocr_output -- --ignored --nocapture
 *
 * Committed rather than hand-written on purpose. A previous text-search fix in
 * this repo shipped broken because its fixtures were shaped the way pdf.js was
 * *assumed* to emit text rather than how it does. These are the coordinates the
 * engine actually produces — points, origin bottom-left, A4 at 595x842.
 */
import type { OcrPage } from '@/lib/ocrProcessor';

export const REAL_OCR_PAGES: OcrPage[] = [
  {
    "index": 0,
    "width": 595.0,
    "height": 842.0,
    "blocks": [
      {
        "text": "RESIDENCE PERMIT APPLICATION",
        "x": 58.64476129282592,
        "y": 735.5261628194072,
        "width": 349.42505258728914,
        "height": 18.473836898803665,
        "confidence": 1.0
      },
      {
        "text": "Surname: MUSTERMANN",
        "x": 58.64476450981259,
        "y": 691.333333459787,
        "width": 246.79671574813656,
        "height": 18.492247899373364,
        "confidence": 1.0
      },
      {
        "text": "Given name: ERIKA",
        "x": 57.42300185900354,
        "y": 648.6337211351823,
        "width": 189.3737056514317,
        "height": 17.1337203979492,
        "confidence": 1.0
      },
      {
        "text": "Date of birth: 12 August 1979",
        "x": 58.64476921422351,
        "y": 600.9040691994394,
        "width": 272.4537897910944,
        "height": 22.09593073527017,
        "confidence": 1.0
      },
      {
        "text": "Nationality: GERMAN",
        "x": 56.201231459891545,
        "y": 557.9999999571561,
        "width": 204.0349053428795,
        "height": 22.098837534586657,
        "confidence": 1.0
      }
    ]
  },
  {
    "index": 1,
    "width": 595.0,
    "height": 842.0,
    "blocks": [
      {
        "text": "Reference number: AZ 2026 004471",
        "x": 58.6447620845899,
        "y": 734.302325623703,
        "width": 338.4291579021185,
        "height": 18.36434110005691,
        "confidence": 1.0
      },
      {
        "text": "Issued at: BERLIN",
        "x": 56.20123182966642,
        "y": 690.2441857915551,
        "width": 174.7125262936446,
        "height": 19.581395467122398,
        "confidence": 1.0
      },
      {
        "text": "This document was produced for testing.",
        "x": 57.423003182752545,
        "y": 644.9622091381895,
        "width": 381.1909479737148,
        "height": 22.03779093424478,
        "confidence": 1.0
      },
      {
        "text": "Page two of two.",
        "x": 58.64476743690016,
        "y": 601.9999999479942,
        "width": 156.38603176274998,
        "height": 20.999999999999975,
        "confidence": 1.0
      }
    ]
  }
] as OcrPage[];
