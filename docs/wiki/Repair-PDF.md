# <img src="img/icons/wrench.svg" width="28"/> Repair PDF

**What it's for:** fix a PDF that other tools reject as corrupted or malformed.

## How to repair a PDF

1. **Select PDF**: open the problem PDF.
2. **Repair**: run the repair pass.
3. **Save**: write the repaired PDF to disk.

## How repair works

Repair uses [qpdf](https://github.com/qpdf/qpdf), which rebuilds a document's
**cross-reference table** by scanning the file for the objects it actually
contains, instead of trusting the offsets the file claims. That is what fixes the
commonest kinds of damage: a broken `startxref` pointer, a missing or truncated
xref table, object offsets that no longer line up, or junk prepended to the file
so it no longer starts where it says it does.

Your pages come back as they were. qpdf preserves the existing page content
rather than re-rendering it, so text stays selectable, images are not
re-compressed, and page sizes are unchanged.

## Why repair might not fix a file

Repair recovers **structure**, not **content**. If parts of the file are simply
gone — most often a download or copy that stopped partway, taking whole objects
with it — there is nothing left to rebuild them from, and Papercut will say so
rather than hand you a file that looks repaired and is not.

When that happens, the only real fix is another copy of the document: download or
export it again from wherever it came from. A second repair pass will not help,
because the missing bytes are not recoverable from what remains.

---

See also: [Compress PDF](Compress-PDF)
