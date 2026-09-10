# Troubleshooting

## "Apple could not verify Papercut is free of malware" (macOS)

Papercut is signed, but not yet notarised by Apple, so macOS blocks the first
launch. Nothing is wrong with the download. Verified on macOS 26:

1. Open Papercut. macOS refuses with **"Papercut" Not Opened**. Click **Done**.
   Do not skip this: the override does not exist until macOS has actually
   blocked you.
2. **System Settings → Privacy & Security**, scroll to **Security** at the
   bottom. Papercut is named there. Click **Open Anyway**. This appears for
   about an hour after the block, then expires.
3. A second dialog asks **Open "Papercut"?** with three buttons.

   > ⚠️ The blue default button is **Move to Bin** (**Move to Trash** in US
   > English), which deletes the app. Pressing Return here throws Papercut away.
   > Click **Open Anyway** deliberately.

4. Authenticate with Touch ID or an administrator password. macOS saves the
   exception and Papercut opens normally from then on.

### "Papercut is damaged and can't be opened", or Open Anyway never appears

Older builds (before v1.0.0) shipped a broken signature and produced this
harsher message, which has no Open Anyway path. The same applies if the
one-hour window expired. Clear the quarantine flag directly:

```
xattr -cr /Applications/Papercut.app
```

## "Windows protected your PC" (SmartScreen warning)

Click **More info**, then **Run anyway**. Same cause as above, but for
Windows code-signing: it's on the roadmap, not a sign of a broken
installer.

## DOC/DOCX or EPUB/MOBI conversion isn't available

You need [LibreOffice or Calibre](Required-Dependencies) installed and on
your `PATH`. Papercut will show a prompt naming the missing dependency when
this happens.

## "PDF unlock failed" / "password protection failed"

For **Unlock**, this means the password you entered doesn't match the one on
the file, or the PDF itself is corrupted. For **Protect**, it usually means
the source file is corrupted or uses a PDF feature Papercut cannot process.
Try re-exporting the source PDF and protecting it again.

## Still stuck?

[Open an issue](https://github.com/shyhunter/Papercut/issues/new/choose) and
include the exact error message. Happy to help.

---

See also: [Required Dependencies](Required-Dependencies) · [FAQ](FAQ)
