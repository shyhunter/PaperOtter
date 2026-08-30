#!/usr/bin/env bash
# Measure Tesseract's per-word confidence the way Papercut aggregates it.
#
# Why this exists: PLATFORM_PARITY.md bets that Tesseract's confidence can drive
# the same honest-result UI that Vision drives on macOS. That bet is unverified.
# Vision reports ~1.00 on a clean fixture AND on a real handheld photo, so the
# open question is whether Tesseract separates good input from bad at all. If it
# reports ~0.90 on everything, LOW_CONFIDENCE_THRESHOLD = 0.5 is useless for that
# engine and the low-confidence branch needs redesigning before it ships.
#
# Rasterises at 216 dpi to match src-tauri/src/ocr.rs RENDER_SCALE (3x of 72),
# and aggregates confidence char-weighted to match summarise() in
# src/lib/ocrProcessor.ts. A plain mean would not be comparable to the threshold.
#
# Usage:  ./scripts/measure-tesseract-confidence.sh <file.pdf|file.jpg> [label]

set -euo pipefail

INPUT="${1:?usage: $0 <file.pdf|image> [label]}"
LABEL="${2:-$(basename "$INPUT")}"

[ -f "$INPUT" ] || { echo "FAIL: no such file: $INPUT" >&2; exit 1; }
for dep in gs tesseract python3; do
  command -v "$dep" >/dev/null 2>&1 || {
    echo "FAIL: '$dep' not found. sudo apt install tesseract-ocr ghostscript python3" >&2
    exit 1
  }
done

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "=== papercut tesseract confidence measurement ==="
echo "label:      $LABEL"
echo "input:      $INPUT ($(wc -c < "$INPUT") bytes)"
echo "tesseract:  $(tesseract --version 2>&1 | head -1)"
echo "ghostscript:$(gs --version 2>&1 | head -1)"
echo "langs:      $(tesseract --list-langs 2>&1 | tail -n +2 | tr '\n' ' ')"
echo

# --- rasterise ---------------------------------------------------------------
# tr rather than ${INPUT,,}: the latter is a bash 4+ expansion and macOS
# still ships bash 3.2, so the script could not be tested on the machine
# that wrote it.
case "$(printf '%s' "$INPUT" | tr 'A-Z' 'a-z')" in
  *.pdf)
    # 216 dpi == ocr.rs RENDER_SCALE 3x. Alpha bits are the standard OCR
    # rasterisation setting; on an already-raster scan they change little.
    gs -q -dNOPAUSE -dBATCH -dSAFER \
       -sDEVICE=png16m -r216 \
       -dTextAlphaBits=4 -dGraphicsAlphaBits=4 \
       -sOutputFile="$WORK/page-%d.png" "$INPUT"
    ;;
  *)
    cp "$INPUT" "$WORK/page-1.png"
    ;;
esac

# Assert a plausible page count before trusting anything downstream.
shopt -s nullglob
PAGES=("$WORK"/page-*.png)
if [ "${#PAGES[@]}" -lt 1 ]; then
  echo "FAIL: rasterised 0 pages — nothing was measured." >&2
  exit 1
fi
echo "rasterised ${#PAGES[@]} page(s) at 216 dpi"
echo

# --- recognise ---------------------------------------------------------------
# English only: settled decision, Papercut ships no other tessdata.
: > "$WORK/all.tsv"
for page in "${PAGES[@]}"; do
  tesseract "$page" stdout -l eng --psm 3 tsv 2>/dev/null | tail -n +2 >> "$WORK/all.tsv"
done

# --- aggregate ---------------------------------------------------------------
LABEL="$LABEL" PAGE_COUNT="${#PAGES[@]}" python3 - "$WORK/all.tsv" <<'PY'
import os, sys, statistics

# Tesseract TSV: level page block par line word left top width height conf text
# Only level 5 (word) rows carry a real confidence; every other level reports -1.
words = []
with open(sys.argv[1], encoding="utf-8", errors="replace") as fh:
    for raw in fh:
        cols = raw.rstrip("\n").split("\t")
        if len(cols) < 12:
            continue
        try:
            level, conf = int(cols[0]), float(cols[10])
        except ValueError:
            continue
        text = cols[11].strip()
        if level != 5 or conf < 0 or not text:
            continue
        words.append((conf / 100.0, text))

label = os.environ["LABEL"]
print(f"--- RESULT [{label}] ---")
if not words:
    # foundText == False in summarise(): a different outcome from a poor read.
    print("wordCount:            0")
    print("foundText:            False   <- nothing readable at all")
    print("meanConfidence:       0.0")
    print("lowConfidence:        False   (foundText gates it)")
    print("VERDICT: no text found — this is the nothing-found branch, not the uncertain branch.")
    sys.exit(0)

confs = [c for c, _ in words]
chars = sum(len(t) for _, t in words)

# Char-weighted, exactly as summarise() in src/lib/ocrProcessor.ts.
weighted = sum(c * len(t) for c, t in words) / chars
plain = statistics.fmean(confs)
ordered = sorted(confs)

def pct(p):
    return ordered[min(len(ordered) - 1, int(p / 100 * len(ordered)))]

THRESHOLD = 0.5
print(f"pageCount:            {os.environ['PAGE_COUNT']}")
print(f"wordCount:            {len(words)}")
print(f"charCount:            {chars}")
print(f"meanConfidence:       {weighted:.4f}   <- char-weighted, compares to threshold")
print(f"  plain mean:         {plain:.4f}")
print(f"  median:             {statistics.median(confs):.4f}")
print(f"  p10 / p25:          {pct(10):.4f} / {pct(25):.4f}")
print(f"  min / max:          {min(confs):.4f} / {max(confs):.4f}")
print(f"  stdev:              {statistics.pstdev(confs):.4f}")
print()
print("  distribution (per-word confidence):")
# Integer bucket index: float edges put 0.3 in both 0.2-0.3 and 0.3-0.4.
buckets = [0] * 10
for c in confs:
    buckets[min(9, int(c * 10))] += 1
for i, n in enumerate(buckets):
    bar = "#" * min(50, round(50 * n / len(confs)))
    print(f"    {i / 10:.1f}-{(i + 1) / 10:.1f}  {n:5d}  {bar}")
assert sum(buckets) == len(confs), "histogram lost or duplicated words"
print()
print(f"LOW_CONFIDENCE_THRESHOLD = {THRESHOLD}")
print(f"lowConfidence would be:  {weighted < THRESHOLD}")
print(f"VERDICT: {'TRIPS the warning' if weighted < THRESHOLD else 'does NOT trip the warning'}")
PY
