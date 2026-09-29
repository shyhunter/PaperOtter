# Troubleshooting

## "Apple could not verify PaperOtter is free of malware" (macOS)

PaperOtter is signed, but not yet notarised by Apple, so macOS blocks the first
launch. Nothing is wrong with the download. Verified on macOS 26:

1. Open PaperOtter. macOS refuses with **"PaperOtter" Not Opened**. Click **Done**.
   Do not skip this: the override does not exist until macOS has actually
   blocked you.
2. **System Settings → Privacy & Security**, scroll to **Security** at the
   bottom. PaperOtter is named there. Click **Open Anyway**. This appears for
   about an hour after the block, then expires.
3. A second dialog asks **Open "PaperOtter"?** with three buttons.

   > ⚠️ The blue default button is **Move to Bin** (**Move to Trash** in US
   > English), which deletes the app. Pressing Return here throws PaperOtter away.
   > Click **Open Anyway** deliberately.

4. Authenticate with Touch ID or an administrator password. macOS saves the
   exception and PaperOtter opens normally from then on.

### "PaperOtter is damaged and can't be opened", or Open Anyway never appears

Older builds (before v1.0.0) shipped a broken signature and produced this
harsher message, which has no Open Anyway path. The same applies if the
one-hour window expired. Clear the quarantine flag directly:

```
xattr -dr com.apple.quarantine /Applications/PaperOtter.app
```

## "Windows protected your PC" (SmartScreen warning)

Click **More info**, then **Run anyway**. Same cause as above, but for
Windows code-signing: it's on the roadmap, not a sign of a broken
installer.

## Linux AppImage closes straight away: "AppRun.wrapped: Permission denied"

Fixed in **v1.0.1**. In v1.0.0, one file inside the AppImage could only be run
by the user who owned it. Started normally that is you, so it worked; started
inside a sandbox such as firejail, which runs it as someone else, it closed
immediately. Download the current AppImage from
[Releases](https://github.com/shyhunter/PaperOtter/releases/latest).

## Compress says a PDF "opens without a password, but its owner has protected it against changes"

That is deliberate. Many published PDFs (annual reports, statements) open in any
reader without a password but are encrypted to stop copying, printing or
editing. Compressing one would have to remove that protection, and PaperOtter
will not do that behind your back, so it leaves the file alone. Up to v1.0.0
this case was wrongly reported as "password-protected".

## DOC/DOCX or EPUB/MOBI conversion isn't available

You need [LibreOffice or Calibre](Required-Dependencies) installed and on
your `PATH`. PaperOtter will show a prompt naming the missing dependency when
this happens.

## "PDF unlock failed" / "password protection failed"

For **Unlock**, this means the password you entered doesn't match the one on
the file, or the PDF itself is corrupted. For **Protect**, it usually means
the source file is corrupted or uses a PDF feature PaperOtter cannot process.
Try re-exporting the source PDF and protecting it again.

## Still stuck?

[Open an issue](https://github.com/shyhunter/PaperOtter/issues/new/choose) and
include the exact error message. Happy to help.

---

See also: [Required Dependencies](Required-Dependencies) · [FAQ](FAQ)
