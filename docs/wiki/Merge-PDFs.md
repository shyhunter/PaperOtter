# <img src="img/icons/merge.svg" width="28"/> Merge PDFs

**What it's for:** combine several PDFs into a single document, in whatever order you choose.

## How to merge PDFs

1. **Pick Files**: select two or more PDFs (this tool needs at least 2 to run).
2. **Order**: arrange the files in the order you want their pages to appear in the final document.
3. **Save**: write the merged PDF to disk.

## How merging works

Papercut loads each PDF and copies its pages, in full, into one new document: in the exact order you arranged the files. Every page from every source file is preserved; nothing is dropped or re-flowed. If a source file is itself multi-page, all of its pages land together, back to back, before moving to the next file in your order.

Password-protected PDFs are read with encryption ignored at the parsing level, so a merge can proceed even if a source file has restrictions set, but see below for what that means in practice.

## Why merging might fail or behave unexpectedly

- **Fewer than 2 files selected.** Merge needs at least two PDFs: for combining a single file with itself or extracting from one file, use [Organize PDF](Organize-PDF), or [Split PDF](Split-PDF) instead.
- **A source file is corrupted.** If a PDF can't be parsed at all, merging stops: try [Repair PDF](Repair-PDF) on that file first.
- **Encrypted source files.** Papercut can read pages from an encrypted PDF for merging purposes, but this doesn't remove or bypass any protection on the *original* file: the merged output is a new, unencrypted document made up of the pages themselves.

---

See also: [Split PDF](Split-PDF) · [Organize PDF](Organize-PDF)
