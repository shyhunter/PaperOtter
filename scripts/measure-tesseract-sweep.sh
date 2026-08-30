#!/usr/bin/env bash
# Does Tesseract's confidence fall as input quality falls?
#
# The question PLATFORM_PARITY.md phases 3-4 rest on. Vision reports ~1.00 on a
# clean fixture AND on a real handheld photo, so its confidence cannot separate
# the two; LOW_CONFIDENCE_THRESHOLD = 0.5 was tuned for that behaviour. If
# Tesseract also holds ~0.9 no matter how bad the page gets, the threshold is
# meaningless for it and the honest-result UI needs redesigning before non-macOS
# OCR ships.
#
# Two arbitrary photos give two points. This gives a curve, from the resolution
# we actually ship down to something barely legible, degrading one known page so
# nothing varies but quality. Ghostscript generates every variant, so this needs
# no photos and no packages beyond what the measurement script already requires.
#
# Usage: ./scripts/measure-tesseract-sweep.sh [source.pdf]

set -euo pipefail

SRC="${1:-test-fixtures/scanned.pdf}"
HERE="$(cd "$(dirname "$0")" && pwd)"
MEASURE="$HERE/measure-tesseract-confidence.sh"

[ -f "$SRC" ]     || { echo "FAIL: no such file: $SRC" >&2; exit 1; }
[ -x "$MEASURE" ] || { echo "FAIL: $MEASURE missing or not executable" >&2; exit 1; }

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# label:device:dpi:jpegq  — 216 dpi is what src-tauri/src/ocr.rs actually uses.
LEVELS="
pristine-216dpi-png:png16m:216:0
good-150dpi-png:png16m:150:0
fair-100dpi-png:png16m:100:0
poor-72dpi-png:png16m:72:0
artifacts-216dpi-q40:jpeg:216:40
artifacts-150dpi-q20:jpeg:150:20
bad-100dpi-q10:jpeg:100:10
awful-72dpi-q5:jpeg:72:5
cliff-50dpi-q5:jpeg:50:5
cliff-40dpi-q5:jpeg:40:5
cliff-30dpi-q5:jpeg:30:5
cliff-24dpi-q5:jpeg:24:5
gone-18dpi-q5:jpeg:18:5
"

echo "=== Tesseract confidence vs input quality ==="
echo "source:     $SRC"
echo "tesseract:  $(tesseract --version 2>&1 | head -1)"
echo "ghostscript:$(gs --version 2>&1 | head -1)"
echo
printf '%-24s %6s %8s %10s %9s %s\n' LEVEL BYTES WORDS MEANCONF MEDIAN VERDICT
printf '%-24s %6s %8s %10s %9s %s\n' ------------------------ ------ -------- ---------- --------- -------

for level in $LEVELS; do
  label="${level%%:*}"; rest="${level#*:}"
  device="${rest%%:*}"; rest="${rest#*:}"
  dpi="${rest%%:*}";    jpegq="${rest#*:}"

  ext=png; [ "$device" = jpeg ] && ext=jpg
  args=(-q -dNOPAUSE -dBATCH -dSAFER -sDEVICE="$device" -r"$dpi"
        -dTextAlphaBits=4 -dGraphicsAlphaBits=4)
  [ "$jpegq" != 0 ] && args+=(-dJPEGQ="$jpegq")
  gs "${args[@]}" -sOutputFile="$WORK/${label}-%d.$ext" "$SRC"

  # Page 1 only: the sweep compares quality against itself, and one page keeps
  # every row measuring the same content.
  page="$WORK/${label}-1.$ext"
  [ -f "$page" ] || { echo "FAIL: $label produced no page" >&2; exit 1; }
  bytes=$(wc -c < "$page" | tr -d ' ')

  out="$("$MEASURE" "$page" "$label" 2>/dev/null || true)"
  words=$(printf '%s' "$out"  | awk '/^wordCount:/{print $2}')
  mean=$(printf '%s' "$out"   | awk '/^meanConfidence:/{print $2}')
  median=$(printf '%s' "$out" | awk '/^  median:/{print $2}')
  verdict=$(printf '%s' "$out"| awk '/^VERDICT:/{$1="";print}' | cut -c1-28)
  printf '%-24s %6s %8s %10s %9s %s\n' \
    "$label" "$bytes" "${words:-?}" "${mean:-?}" "${median:-?}" "${verdict:-?}"
done

echo
echo "Read the SPREAD, not any single row. If meanConfidence barely moves from"
echo "pristine to awful, Tesseract's confidence cannot tell good input from bad"
echo "and LOW_CONFIDENCE_THRESHOLD = 0.5 is useless for it."
echo
echo "The first eight rows all stay legible on this fixture -- large, clean,"
echo "synthetic text survives brutal downscaling -- so a flat confidence there is"
echo "HONEST, not uninformative. The cliff rows are the ones that answer the"
echo "question: watch WORDS and the recognised text fall apart, and see whether"
echo "meanConfidence falls with them."
