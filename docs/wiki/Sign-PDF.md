# <img src="img/icons/pen-tool.svg" width="28"/> Sign PDF

**What it's for:** add a visual signature stamp to a PDF — for informal sign-offs, not legally-binding digital signatures.

## How to sign a PDF

1. **Select PDF** — open a PDF file.
2. **Signature** — create or choose a signature image.
3. **Place** — position the signature on the page(s) you want it on.
4. **Save** — write the signed PDF to disk.

## How it works

Your signature is captured as a PNG image, then embedded directly onto the page(s) you place it on, at the position and size you chose. This is a **visual stamp** — a picture of a signature drawn onto the page — not a cryptographic digital signature. It doesn't add certificate-based signing metadata, and PDF viewers won't show a "digitally signed" indicator for it. It's meant for the same purpose as printing a document, signing it by hand, and scanning it back in — just without the printer.

## Why this isn't a substitute for a real digital signature

If you need a legally-recognized, tamper-evident digital signature (the kind that cryptographically verifies who signed and that the document hasn't changed since), Sign PDF isn't that — it's a convenient way to look signed, not to prove signing. For contracts or documents that require actual signature verification, use a dedicated e-signature service instead.

---

See also: [Watermark](Watermark) · [Edit PDF](Edit-PDF)
