# <img src="img/icons/wrench.svg" width="28"/> Repair PDF

**What it's for:** fix a PDF that other tools reject as corrupted or malformed.

## How to repair a PDF

1. **Select PDF**: open the problem PDF.
2. **Repair**: run the repair pass.
3. **Save**: write the repaired PDF to disk.

## How repair works

Repair runs the file through [Ghostscript](https://ghostscript.com/)'s standard PDF re-writer (`pdfwrite`), the same core engine used for compression, but here the point isn't shrinking the file, it's that re-serializing a PDF from scratch fixes many structural problems along the way (broken cross-reference tables, malformed object streams, and similar low-level corruption).

Papercut also handles **partial success**: if Ghostscript exits with a non-zero (error) status but still managed to write a non-empty output file, that output is returned rather than treated as a hard failure: a partially-repaired file is usually far more useful than nothing. Only a genuine empty/no-output result counts as a real failure.

## Why repair might not fully fix a file

Repair works well for structural corruption Ghostscript can re-parse and rewrite: it can't recover data that's fundamentally missing or unreadable (e.g. a file truncated mid-download, with entire objects gone). If a repaired file still has visible issues, that's usually a sign the damage was in content Ghostscript couldn't reconstruct, not something a second repair pass would fix.

---

See also: [Compress PDF](Compress-PDF)
