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

### "You can't use this version of the application PaperOtter with this version of macOS"

From **v1.0.2**, PaperOtter needs **macOS 13 Ventura** or newer. It shows PDFs
with pdf.js 6, which needs the Safari 18 engine, and Safari 18 is not available
for macOS 12 Monterey or older. Update macOS, or keep using
[v1.0.1](https://github.com/shyhunter/PaperOtter/releases/tag/v1.0.1).

On Ventura, if PaperOtter opens but PDFs stay blank, install the latest Safari
from **System Settings → General → Software Update**.

## "Windows protected your PC" (SmartScreen warning)

Click **More info**, then **Run anyway**. Same cause as above, but for
Windows code-signing: it's on the roadmap, not a sign of a broken
installer.

## Ubuntu App Center says "potentially unsafe", or "Installed" and nothing happens

Both come from opening the `.deb` by double-clicking it, which hands it to
Ubuntu's App Center:

- **"Potentially unsafe"** is shown for every `.deb` that does not come from
  Ubuntu's own store. It is not specific to PaperOtter.
- **"Installed"** is shown when an older PaperOtter is already installed. App
  Center does not offer to update from a downloaded file, so nothing happens.

Install or update from a terminal instead, in the folder you downloaded to:

```
cd ~/Downloads
sudo apt install ./PaperOtter_<version>_amd64.deb
```

apt replaces the older version and your settings stay. Check which version you
have with:

```
dpkg -s paper-otter | grep Version
```

If apt says `E: Unsupported file … given on command line`, the terminal is not
in the folder with the file: `cd` there first, or give the full path.

## Running the AppImage (Linux)

Make the file executable once, then run it:

```
chmod +x PaperOtter_<version>_amd64.AppImage
./PaperOtter_<version>_amd64.AppImage
```

- **Nothing happens, or "dlopen(): error loading libfuse.so.2":** FUSE 2 is
  missing. Ubuntu 22.04 and newer do not install it by default:
  `sudo apt install libfuse2t64` on 24.04 and newer, `sudo apt install libfuse2`
  on 22.04.
- **Running it sandboxed (optional):** `firejail --appimage ./PaperOtter_<version>_amd64.AppImage`.
  This works since v1.0.1 (see the next section).
- **Adding it to the app menu (optional):** install
  [appimaged](https://github.com/probonopd/go-appimage), which picks up
  AppImages in your home folder.
- **Updating:** download the new AppImage and delete the old one. PaperOtter
  shows a notice when a newer version is out; it does not update itself, and
  AppImageUpdate is not supported.
- **Requirements:** glibc 2.35 or newer (Ubuntu 22.04, Debian 12, Fedora 36 or
  newer). The release is built on Ubuntu 22.04 against its system libraries,
  including WebKitGTK 4.1, so older distributions are not supported.

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
