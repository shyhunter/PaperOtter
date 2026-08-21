# Common Tasks

Looking for a specific tool by name? See the sidebar. This page is organized
the other way around -- by what you're trying to *do*.

## Sharing and sending files

**"My PDF is too big to email."**
Use [Compress PDF](Compress-PDF). Pick the **Web** or **Screen** quality preset for the smallest result, or turn on **Target file size** if you need to hit a specific limit.

**"I need to send just a few pages, not the whole document."**
Use [Split PDF](Split-PDF) — enter a page range like `1-3, 5` and each range is saved as its own file.

**"I have several PDFs I need to send as one file."**
Use [Merge PDFs](Merge-PDFs) — pick the files, arrange the order, done.

**"A page came out sideways or upside down."**
Use [Rotate PDF](Rotate-PDF) (or [Rotate Image](Rotate-Image) if it's a photo, not a PDF).

**"I need to turn a PDF page into a picture I can drop into a chat or a slide."**
Use [PDF to JPG](PDF-to-JPG).

**"I have scanned photos of pages I need as one PDF."**
Use [JPG to PDF](JPG-to-PDF).

## Protecting and locking down documents

**"I want to password-protect a PDF before sending it."**
Use [Protect PDF](Protect-PDF).

**"I have a password-protected PDF and want to remove the password."**
Use [Unlock PDF](Unlock-PDF) — you need to already know the password; this isn't a password-recovery tool.

**"I need to permanently black out an SSN, account number, or other sensitive text before sharing a document."**
Use [Redact PDF](Redact-PDF) — and only this one. [Crop PDF](Crop-PDF) just hides content outside the visible page (it's still in the file), and covering text with a shape in [Edit PDF](Edit-PDF) just draws over the original text without removing it. Redact PDF is the only tool that actually flattens the page so nothing's left to recover.

## Cleaning up and organizing

**"My scanned document has ugly borders or margins."**
Use [Crop PDF](Crop-PDF).

**"I need to reorder, delete, or duplicate pages before sending a document."**
Use [Organize PDF](Organize-PDF).

**"I need to add page numbers before printing."**
Use [Page Numbers](Page-Numbers).

**"I want to mark a document DRAFT or CONFIDENTIAL."**
Use [Watermark](Watermark).

## Signing and editing

**"I need to sign a form without printing it out."**
Use [Sign PDF](Sign-PDF) — note this stamps a picture of your signature onto the page; it's not a legally-binding digital signature. For that, use a dedicated e-signature service.

**"I need to fix a typo or update some text in a PDF and don't have the original source file."**
Use [Edit PDF](Edit-PDF). Just know that "deleted" text is covered with a white box, not actually removed from the file — if the goal is *removing* sensitive text rather than fixing a typo, use [Redact PDF](Redact-PDF) instead.

## Converting between formats

**"I need to turn a Word document into a PDF" (or the reverse).**
Use [Convert Document](Convert-Document).

**"I want a Markdown, HTML, JSON, or plain-text version of a PDF or DOCX for notes/publishing."**
Use [Convert Document](Convert-Document) — these formats work fully offline, no extra software needed.

**"My PDF or Word document is really long and I want it split into one file per chapter."**
Use [Convert Document](Convert-Document)'s **split by chapter** option when converting to Markdown/HTML/JSON/DOCX.

**"I can't convert my EPUB/MOBI, or to DOC/ODT/RTF."**
Those formats need [LibreOffice or Calibre](Required-Dependencies) installed — see that page, or [why a conversion option might not be available](Convert-Document#why-a-conversion-option-might-not-be-available).

**"I need to convert a screenshot between PNG, JPG, and WebP."**
Use [Convert Image](Convert-Image).

## Fixing broken files

**"My PDF won't open, or another tool says it's corrupted."**
Use [Repair PDF](Repair-PDF) first — it fixes most structural issues by re-writing the file. If it still has problems afterward, the damage was likely something no repair pass can reconstruct.

**"Compressing didn't make my file any smaller."**
See [why your file may not get smaller](Compress-PDF#why-your-file-may-not-get-smaller) — usually because the PDF is mostly text (little to recompress) or was already close to optimal.

## Preparing for the long term

**"I need a document that will still open correctly on any computer in 20 years, for legal/compliance records."**
Use [PDF/A Convert](PDF-A-Convert) — it embeds everything the document needs (fonts, color profiles) inside the file itself.

## Working with images

**"I need to shrink a photo before uploading it somewhere with a size limit."**
Use [Compress Image](Compress-Image).

**"I need a transparent image to stay transparent after converting."**
Export as **PNG** or **WebP**, not JPG — JPG has no transparency support and fills transparent areas with white. Applies to both [Compress Image](Compress-Image) and [Convert Image](Convert-Image).

---

See also: [Using Papercut](Using-Papercut) · [Troubleshooting](Troubleshooting) · [FAQ](FAQ)
