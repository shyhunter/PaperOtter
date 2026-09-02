# <img src="img/icons/scissors.svg" width="28"/> Split PDF

**What it's for:** pull specific pages out of a PDF, or break a large PDF into several smaller files.

## How to split a PDF

1. **Pick**: open a PDF file.
2. **Select Pages**: choose how to split it (see below), using the thumbnail grid to check what you're selecting.
3. **Save**: each resulting piece is saved as its own PDF file.

## The three ways to split

- **By Range**: type page ranges like `1-3, 5, 7-10`. Each range (or single page) becomes its own output file.
- **Every N Pages**: automatically groups the document into chunks of N consecutive pages each.
- **Extract All**: every single page becomes its own one-page PDF file.

Output files are named after the source file plus the page numbers they contain (e.g. `report_pages_1-3.pdf`, or `report_page_5.pdf` for a single page).

## Why a range might be rejected

Page ranges are validated against the actual page count before splitting runs:

- A page number or range end that's higher than the document's total pages, or lower than 1, is rejected with the valid range shown.
- A range where the start is after the end (like `10-3`) is rejected.

If you're not sure of the exact page count, check the thumbnail grid: it's numbered and shows exactly what page each number in your range refers to.

---

See also: [Merge PDFs](Merge-PDFs) · [Organize PDF](Organize-PDF)
