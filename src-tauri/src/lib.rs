// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use tauri::ipc::Response;
use tauri::Emitter;
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandEvent;
use image::codecs::jpeg::JpegEncoder;
use image::codecs::png::{PngEncoder, CompressionType};
use std::io::Cursor;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use uuid::Uuid;

mod heic;
mod pdfcompress;
mod ocr;

/// Validates a source file path from the frontend.
/// Blocks null bytes, path traversal, and overly long paths.
fn validate_source_path(path: &str) -> Result<(), String> {
    if path.is_empty() {
        return Err("File path is empty".to_string());
    }
    if path.contains('\0') {
        return Err("Invalid file path".to_string());
    }
    if path.len() > 4096 {
        return Err("File path is too long".to_string());
    }
    // Block path traversal
    let canonical = std::path::Path::new(path);
    for component in canonical.components() {
        if let std::path::Component::ParentDir = component {
            return Err("Path traversal not allowed".to_string());
        }
    }
    // Validate filename characters
    validate_filename_chars(path)?;
    Ok(())
}

/// Allow-list approach: only permit alphanumeric (Unicode-aware),
/// spaces, dots, hyphens, underscores, parens, brackets, and common safe punctuation.
/// Rejects filenames with shell-dangerous characters (backticks, semicolons, dollar signs, quotes, pipes, etc.).
fn validate_filename_chars(path: &str) -> Result<(), String> {
    let filename = std::path::Path::new(path)
        .file_name()
        .and_then(|f| f.to_str())
        .ok_or("Could not read filename")?;

    let safe = filename.chars().all(|c| {
        c.is_alphanumeric()
            || " .-_()[]{}+=#@!,".contains(c)
    });
    if !safe {
        return Err(
            "This filename contains characters that aren't supported. \
             Please rename the file and try again.".to_string()
        );
    }
    Ok(())
}

/// Validates Calibre extra_args against a known-safe flag allow-list.
///
/// Reported from a real build: every Calibre conversion failed outright with
/// "Unsupported conversion option: --enable-heuristics". buildCalibreArgs() in
/// documentConverter.ts pushes --enable-heuristics and --unsmarten-punctuation
/// unconditionally, on every call, before any option is even read -- but this
/// list was written six days later (91f1e0f) without them, so every request
/// this allow-list ever saw was already invalid. Keep this list a superset of
/// buildCalibreArgs()'s output; [CALIBRE-ARGS-01] below pins the TS side's
/// unconditional flags so the two cannot drift apart silently again.
const CALIBRE_ALLOWED_FLAGS: &[&str] = &[
    "--base-font-size", "--font-size-mapping", "--margin-top",
    "--margin-bottom", "--margin-left", "--margin-right",
    "--change-justification", "--insert-blank-line",
    "--line-height", "--input-encoding", "--output-profile",
    "--extra-css", "--enable-heuristics", "--unsmarten-punctuation",
];

fn validate_calibre_extra_args(args: &[String]) -> Result<(), String> {
    let mut i = 0;
    while i < args.len() {
        let flag = &args[i];
        if flag.starts_with("--") {
            // Extract just the flag name (before any =)
            let flag_name = flag.split('=').next().unwrap_or(flag);
            if !CALIBRE_ALLOWED_FLAGS.contains(&flag_name) {
                return Err(format!("Unsupported conversion option: {}", flag_name));
            }
        }
        i += 1;
    }
    Ok(())
}

/// Resolve the system-installed Ghostscript binary path.
///
/// - macOS/Linux: tries `which gs`
/// - Windows: tries `where gswin64c` then `where gs`
///
/// Build a child process that never flashes a console window on Windows.
///
/// A GUI app gets `windows_subsystem = "windows"` and so has no console of its
/// own, but every console-subsystem child it spawns allocates one, and Windows
/// shows it. `detect_converters` runs on the dashboard's first render and
/// spawns powershell, soffice, pandoc and calibre, so launching PaperOtter
/// flashed several black windows over the UI before it had drawn anything.
/// Reported from a real Windows 11 machine on v1.0.0-beta.13; invisible on
/// macOS and Linux, which have no equivalent behaviour.
///
/// `tauri_plugin_shell` already does this for sidecars, which is why
/// Ghostscript never flashed. These are the spawns the app makes itself.
fn quiet_command(program: impl AsRef<std::ffi::OsStr>) -> std::process::Command {
    #[allow(unused_mut)]
    let mut cmd = std::process::Command::new(program);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        // CREATE_NO_WINDOW. Same constant tauri_plugin_shell uses.
        cmd.creation_flags(0x0800_0000);
    }
    cmd
}

/// Build a user-friendly error message for Word AppleScript automation failures.
/// AppleScript errors -1708 ("doesn't understand the X message") and -2753
/// ("variable ... is not defined") both surface when a document opened via
/// `open POSIX file` isn't fully wired into Word's scriptable document interface —
/// the file opens, but save/close commands are rejected. Seen on some Word for
/// Mac builds regardless of source format; not something PaperOtter can work around.
/// Only called from the macOS Word-automation path, but deliberately left
/// compiled on every platform so its unit tests keep running in CI (which is
/// Linux). Without this, `cargo clippy -- -D warnings` fails there on dead_code.
/// Word for Mac's AppleScript constant for a save format.
///
/// These are enum constants from Word's own dictionary, not prose, and two of
/// them shipped as prose: "format Microsoft Word 97-2004 document" and
/// "format rtf format". Neither is valid AppleScript. They do not merely fail
/// at run time, they fail to COMPILE with -2741, so PDF to .doc and PDF to .rtf
/// could never have worked through Word on any Mac: osascript rejected the
/// script before Word ever saw it. Reported as
/// "Word conversion failed: syntax error: Expected end of line, etc. but found
/// identifier. (-2741)".
///
/// Every value here was checked with `osacompile` against a real Word install.
/// The test below pins them: they look like English and are not, so the next
/// person to tidy the wording needs something that says so.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
fn word_save_format(output_format: &str) -> Option<&'static str> {
    match output_format {
        "pdf" => Some("format PDF"),
        "docx" => Some("format document"),
        "doc" => Some("format document97"),
        "rtf" => Some("format rtf"),
        "txt" => Some("format plain text"),
        _ => None,
    }
}

#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
fn format_word_automation_error(stderr: &str) -> String {
    const HINT: &str =
        "Microsoft Word's automation interface isn't responding correctly on this Mac \
         (a known issue on some Word builds — opened documents don't stay scriptable). \
         Conversions through Word can't complete right now. Try quitting and reopening \
         Word, or install LibreOffice for reliable offline conversion.";

    if stderr.contains("(-1708)") || stderr.contains("(-2753)") {
        HINT.to_string()
    } else if stderr.is_empty() {
        "Word conversion failed with no error output.".to_string()
    } else {
        format!("Word conversion failed: {}", stderr)
    }
}

/// Managed cancellation state — holds the running GS child process.
/// cancel_processing() takes the child out and kills it, which signals
/// compress_pdf's event loop to exit with a CANCELLED error.
struct ProcessState {
    /// Set by `cancel_processing`, read between images by the compressor.
    ///
    /// Compression used to be a child process, so cancelling meant killing it.
    /// It now happens inside this process, and the equivalent is a flag the work
    /// loop checks at a point where stopping is safe -- between whole images,
    /// never part-way through rewriting one.
    cancel: Arc<AtomicBool>,
}

/// Decodes any image the app accepts as input.
///
/// This is the single door every user-supplied image comes through on the Rust
/// side. HEIC is routed to the OS decoder (see heic.rs) because the `image` crate
/// has no HEIF support; everything else decodes as before. Adding a format here
/// makes it work in every image tool at once.
fn decode_input_image(bytes: &[u8]) -> Result<image::DynamicImage, String> {
    if heic::is_heic(bytes) {
        return heic::decode(bytes).map(|(img, _frames)| img);
    }
    image::load_from_memory(bytes).map_err(|e| format!("Failed to decode image: {}", e))
}

/// Maps the 1..=100 quality slider to a PNG deflate level, inverted: quality 100
/// is level 0 (fastest, largest file), quality 1 is level 9 (smallest, slowest).
///
/// PNG is lossless, so this changes encode effort and file size, never pixels.
///
/// Mirrors `pngLevelForQuality` in `src/lib/pngCompression.ts`, which draws the
/// slider's label. The two used to be separate formulas — TypeScript rounded and
/// Rust truncated — so the label named a level the encoder was not using. The
/// divisor is 99 rather than 100 because the slider's range is 1..=100, which is
/// 99 steps; dividing by 100 made level 9 unreachable from the bottom of the
/// slider, so "maximum compression" silently was not.
fn png_compression_level(quality: u8) -> u8 {
    let level = ((100.0 - quality as f32) * 9.0 / 99.0).round();
    level.clamp(0.0, 9.0) as u8
}

/// The encoder setting for a slider position.
///
/// `Level(n)` for 1..=9 rather than the three named constants this used to pick
/// between: `Fast`/`Default`/`Best` meant levels 1..8 all encoded identically,
/// so ten labelled steps produced two distinct files.
fn png_compression_for_quality(quality: u8) -> CompressionType {
    match png_compression_level(quality) {
        0 => CompressionType::Fast,
        n => CompressionType::Level(n),
    }
}

/// Core image processing logic — no Tauri dependency.
/// Called by the `process_image` command and directly by unit tests.
fn encode_image(
    source_bytes: &[u8],
    quality: u8,
    output_format: &str,
    resize_width: Option<u32>,
    resize_height: Option<u32>,
    resize_exact: bool,
) -> Result<Vec<u8>, String> {
    // Decode image from source bytes
    let mut img = decode_input_image(source_bytes)?;

    // Resize if dimensions provided
    if let (Some(w), Some(h)) = (resize_width, resize_height) {
        img = if resize_exact {
            img.resize_exact(w, h, image::imageops::FilterType::Lanczos3)
        } else {
            img.resize(w, h, image::imageops::FilterType::Lanczos3)
        };
    }

    let mut output_buf: Vec<u8> = Vec::new();

    match output_format {
        "jpeg" => {
            // Apply white background fill for transparency before JPEG encoding
            let rgba = img.to_rgba8();
            let (w, h) = (rgba.width(), rgba.height());
            let mut white_bg = image::RgbImage::from_pixel(w, h, image::Rgb([255u8, 255, 255]));
            for (x, y, pixel) in rgba.enumerate_pixels() {
                let alpha = pixel[3] as f32 / 255.0;
                let r = (pixel[0] as f32 * alpha + 255.0 * (1.0 - alpha)) as u8;
                let g = (pixel[1] as f32 * alpha + 255.0 * (1.0 - alpha)) as u8;
                let b = (pixel[2] as f32 * alpha + 255.0 * (1.0 - alpha)) as u8;
                white_bg.put_pixel(x, y, image::Rgb([r, g, b]));
            }
            img = image::DynamicImage::ImageRgb8(white_bg);

            let mut encoder = JpegEncoder::new_with_quality(&mut output_buf, quality);
            encoder.encode_image(&img)
                .map_err(|e| format!("JPEG encoding failed: {}", e))?;
        }
        "png" => {
            let encoder = PngEncoder::new_with_quality(
                Cursor::new(&mut output_buf),
                png_compression_for_quality(quality),
                image::codecs::png::FilterType::Adaptive,
            );
            img.write_with_encoder(encoder)
                .map_err(|e| format!("PNG encoding failed: {}", e))?;
        }
        "webp" => {
            // Use webp crate for lossy WebP (image crate's WebP encoder is lossless only)
            let webp_data = webp::Encoder::from_image(&img)
                .map_err(|e| e.to_string())?
                .encode(quality as f32);
            output_buf = webp_data.to_vec();
        }
        _ => {
            return Err(format!("Unsupported format: {}", output_format));
        }
    }

    // Never hand back something larger than what we were given.
    //
    // image-0.25's JPEG encoder hardcodes h:1 v:1 for all three components, so
    // it always writes 4:4:4 and cannot subsample chroma at all. Re-encoding a
    // photograph that arrived as 4:2:0 therefore stores four times the colour
    // data the source had, and a 2.4 MB scan came back 7.5% *larger* at quality
    // 60 -- having also discarded luma detail. Worst of both.
    //
    // This is a floor, not the fix. Returning the original is the honest outcome
    // when our encoder cannot beat the one that wrote the file, but it still
    // means we fail to shrink a file a competent encoder could have shrunk. The
    // real repair is an encoder that can subsample; until then this at least
    // guarantees the app never does the opposite of its purpose.
    //
    // Narrow on purpose: only when the caller asked for the same format they
    // gave us and requested no resize. Converting formats or scaling up may
    // legitimately grow a file, and short-circuiting those would be wrong.
    let unresized = resize_width.is_none() && resize_height.is_none();
    let source_is_jpeg = source_bytes.starts_with(&[0xFF, 0xD8]);
    if output_format == "jpeg" && unresized && source_is_jpeg && output_buf.len() >= source_bytes.len() {
        return Ok(source_bytes.to_vec());
    }

    Ok(output_buf)
}

#[tauri::command]
fn rotate_image(
    source_path: String,
    rotation: u32,
    output_format: String,
    quality: u8,
) -> Result<Response, String> {
    validate_source_path(&source_path)?;
    let source_bytes = std::fs::read(&source_path)
        .map_err(|e| format!("Failed to read file: {}", e))?;

    let img = decode_input_image(&source_bytes)?;

    let rotated = match rotation {
        90 => img.rotate90(),
        180 => img.rotate180(),
        270 => img.rotate270(),
        _ => return Err(format!("Invalid rotation: {}. Must be 90, 180, or 270.", rotation)),
    };

    // Re-encode using encode_image (pass None for resize to skip resizing)
    let mut output_buf: Vec<u8> = Vec::new();
    match output_format.as_str() {
        "jpeg" => {
            let rgba = rotated.to_rgba8();
            let (w, h) = (rgba.width(), rgba.height());
            let mut white_bg = image::RgbImage::from_pixel(w, h, image::Rgb([255u8, 255, 255]));
            for (x, y, pixel) in rgba.enumerate_pixels() {
                let alpha = pixel[3] as f32 / 255.0;
                let r = (pixel[0] as f32 * alpha + 255.0 * (1.0 - alpha)) as u8;
                let g = (pixel[1] as f32 * alpha + 255.0 * (1.0 - alpha)) as u8;
                let b = (pixel[2] as f32 * alpha + 255.0 * (1.0 - alpha)) as u8;
                white_bg.put_pixel(x, y, image::Rgb([r, g, b]));
            }
            let img_rgb = image::DynamicImage::ImageRgb8(white_bg);
            let mut encoder = JpegEncoder::new_with_quality(&mut output_buf, quality);
            encoder.encode_image(&img_rgb)
                .map_err(|e| format!("JPEG encoding failed: {}", e))?;
        }
        "png" => {
            let encoder = PngEncoder::new_with_quality(
                Cursor::new(&mut output_buf),
                png_compression_for_quality(quality),
                image::codecs::png::FilterType::Adaptive,
            );
            rotated.write_with_encoder(encoder)
                .map_err(|e| format!("PNG encoding failed: {}", e))?;
        }
        "webp" => {
            let webp_data = webp::Encoder::from_image(&rotated)
                .map_err(|e| e.to_string())?
                .encode(quality as f32);
            output_buf = webp_data.to_vec();
        }
        _ => {
            return Err(format!("Unsupported format: {}", output_format));
        }
    }

    Ok(Response::new(output_buf))
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

/// Encode an image, off the UI thread.
///
/// A synchronous #[tauri::command] runs on the main thread, so the window stops
/// responding for as long as the encode takes. JPEG and WebP were quick enough
/// to hide that; PNG is lossless, so a photo that arrived as a multi-megabyte
/// JPEG has to be stored pixel for pixel and the app visibly hung.
#[tauri::command]
async fn process_image(
    source_path: String,
    quality: u8,
    output_format: String,
    resize_width: Option<u32>,
    resize_height: Option<u32>,
    resize_exact: bool,
) -> Result<Response, String> {
    validate_source_path(&source_path)?;
    let output_buf = tauri::async_runtime::spawn_blocking(move || {
        let source_bytes = std::fs::read(&source_path)
            .map_err(|e| format!("Failed to read file: {}", e))?;
        encode_image(
            &source_bytes,
            quality,
            &output_format,
            resize_width,
            resize_height,
            resize_exact,
        )
    })
    .await
    .map_err(|e| format!("Image processing could not be started: {e}"))??;
    Ok(Response::new(output_buf))
}

/// Decodes a HEIC to PNG for the webview.
///
/// The webview cannot decode HEIC — `createImageBitmap` and `<img>` both fail on
/// it — so previews, thumbnails and dimension reads go through here and get PNG
/// bytes back. Only ever called for files the frontend has already identified as
/// HEIC; every other format is read straight off disk.
#[tauri::command]
fn decode_heic_preview(source_path: String) -> Result<Response, String> {
    validate_source_path(&source_path)?;
    let source_bytes = std::fs::read(&source_path)
        .map_err(|e| format!("Failed to read file: {}", e))?;

    let (img, _frames) = heic::decode(&source_bytes)?;

    let mut output_buf: Vec<u8> = Vec::new();
    let encoder = PngEncoder::new_with_quality(
        Cursor::new(&mut output_buf),
        CompressionType::Fast,
        image::codecs::png::FilterType::Adaptive,
    );
    img.write_with_encoder(encoder)
        .map_err(|e| format!("PNG encoding failed: {}", e))?;

    Ok(Response::new(output_buf))
}

/// How many images a HEIC container holds, so the UI can say when it used the
/// primary one out of several rather than silently picking a frame.
#[tauri::command]
fn heic_frame_count(source_path: String) -> Result<usize, String> {
    validate_source_path(&source_path)?;
    let source_bytes = std::fs::read(&source_path)
        .map_err(|e| format!("Failed to read file: {}", e))?;
    heic::frame_count(&source_bytes)
}

/// Reads the text on a scanned PDF and where it sits.
///
/// Returns JSON: one entry per page with its size in points and the recognised
/// blocks positioned in PDF user space, ready for the caller to lay an invisible
/// text layer over. Building that layer is done with pdf-lib on the TypeScript
/// side, where this app's PDF writing already lives.
///
/// Recognition is CPU-bound and can take seconds per page, so it runs on a
/// blocking thread and emits `ocr-progress` as `[page, total]` before each page —
/// a long document must not look like a hang.
#[tauri::command]
async fn ocr_pdf(
    app: tauri::AppHandle,
    source_path: String,
    languages: Vec<String>,
) -> Result<String, String> {
    validate_source_path(&source_path)?;

    let handle = app.clone();
    let pages = tauri::async_runtime::spawn_blocking(move || {
        ocr::recognize_pdf(&source_path, &languages, |index, total| {
            let _ = handle.emit("ocr-progress", (index, total));
        })
    })
    .await
    .map_err(|e| format!("Text recognition could not be started: {e}"))??;

    serde_json::to_string(&pages).map_err(|e| format!("Could not encode the result: {e}"))
}

/// Which languages this machine can recognise text in.
///
/// Queried rather than hardcoded so the picker can never offer a language the
/// installed macOS cannot actually do, and never hides one it can.
#[tauri::command]
fn ocr_languages() -> Result<Vec<String>, String> {
    ocr::supported_languages()
}

/// Writes a searchable copy of a scanned PDF from text already recognised.
///
/// Split from `ocr_pdf` on purpose. Recognition is the slow part and its result
/// is useful on its own — the UI shows what was found and how confident it is
/// before anything is written, and redaction search uses the same data. Passing
/// it back here avoids recognising the document twice.
#[tauri::command]
async fn write_searchable_pdf(source_path: String, pages_json: String) -> Result<Response, String> {
    validate_source_path(&source_path)?;
    let pages: Vec<ocr::OcrPage> = serde_json::from_str(&pages_json)
        .map_err(|e| format!("Could not read the recognised text: {e}"))?;

    let bytes = tauri::async_runtime::spawn_blocking(move || {
        ocr::build_searchable_pdf(&source_path, &pages)
    })
    .await
    .map_err(|e| format!("Writing the searchable PDF could not be started: {e}"))??;

    Ok(Response::new(bytes))
}

/// Cancel an in-progress compression by killing the GS child process.
/// Fire-and-forget from the TypeScript side — no return value needed.
#[tauri::command]
fn cancel_processing(state: tauri::State<ProcessState>) {
    state.cancel.store(true, Ordering::Relaxed);
}

#[tauri::command]
async fn compress_pdf(
    state: tauri::State<'_, ProcessState>,
    source_path: String,
    preset: String,
    downsample_images: Option<bool>,
) -> Result<tauri::ipc::Response, String> {
    validate_source_path(&source_path)?;
    let preset = pdfcompress::Preset::from_name(&preset)?;
    let downsample = downsample_images.unwrap_or(true);

    // Cleared here rather than after the run: a cancel left set by a previous
    // job would stop the next one before it started.
    let cancel = state.cancel.clone();
    cancel.store(false, Ordering::Relaxed);

    let bytes = tauri::async_runtime::spawn_blocking(move || -> Result<Vec<u8>, String> {
        let source = std::fs::read(&source_path)
            .map_err(|e| format!("Could not read the file: {e}"))?;
        pdfcompress::compress(&source, preset, downsample, &cancel, |_, _| {})
    })
    .await
    .map_err(|e| format!("Compression task failed: {e}"))??;

    Ok(tauri::ipc::Response::new(bytes))
}

#[tauri::command]
async fn repair_pdf(source_path: String) -> Result<tauri::ipc::Response, String> {
    validate_source_path(&source_path)?;

    // Off the async runtime: rebuilding a large document is CPU-bound, and the
    // same pattern the image commands above already use.
    let bytes = tauri::async_runtime::spawn_blocking(move || -> Result<Vec<u8>, String> {
        let source = std::fs::read(&source_path)
            .map_err(|e| format!("Could not read the file: {e}"))?;
        rebuild_pdf(&source)
    })
    .await
    .map_err(|e| format!("Repair task failed: {e}"))??;

    Ok(tauri::ipc::Response::new(bytes))
}

/// Rebuild a damaged PDF. Bytes in, bytes out, so it can be tested directly.
///
/// qpdf reconstructs the cross-reference table by scanning the file for objects,
/// which is what makes this a repair rather than a re-save.
///
/// It replaced Ghostscript, which was not repairing these files at all. Measured
/// on five kinds of damage -- a broken startxref, a missing xref table, shifted
/// object offsets, a junk prefix, and a truncated file -- Ghostscript's pdfwrite
/// device returned a SINGLE blank US-Letter page carrying a 23-byte content
/// stream every time, and exited 0 while doing it, so the tool reported success
/// and handed back a document with the content gone. qpdf recovers all three
/// pages of the same fixture with byte-identical content streams on four of the
/// five, and refuses the truncated one rather than inventing something. The
/// REPAIR tests below hold that.
fn rebuild_pdf(source: &[u8]) -> Result<Vec<u8>, String> {
    let pdf = qpdf::QPdf::read_from_memory(source).map_err(|e| unrepairable(&e.to_string()))?;
    pdf.writer()
        .write_to_memory()
        .map_err(|e| unrepairable(&e.to_string()))
}

/// What to tell someone whose file cannot be rebuilt.
///
/// Says what was wrong and what they can actually do about it, rather than
/// surfacing a library error on its own. There is no third option to offer: if
/// too little of the structure survives, the content is not in the file to
/// recover.
fn unrepairable(detail: &str) -> String {
    let reason = detail.lines().next().unwrap_or(detail).trim();
    format!(
        "This PDF is damaged too badly to rebuild: {reason}. \
         Too little of the file's structure survives to recover the pages from it. \
         If you have another copy, or can download or export the document again, \
         that is the only way to get the content back."
    )
}

/// Convert a document using LibreOffice (system-installed, not bundled).
/// Uses `soffice --headless --convert-to` for format conversion.
/// On macOS, falls back to the full application path if `soffice` is not in PATH.
#[tauri::command]
async fn convert_with_libreoffice(
    app: tauri::AppHandle,
    source_path: String,
    output_format: String,
) -> Result<tauri::ipc::Response, String> {
    validate_source_path(&source_path)?;
    // Validate output_format against allow-list
    let valid_formats = ["docx", "doc", "odt", "pdf", "txt", "rtf"];
    if !valid_formats.contains(&output_format.as_str()) {
        return Err(format!(
            "Invalid output format '{}'. Must be one of: {}",
            output_format,
            valid_formats.join(", ")
        ));
    }

    // Use a unique temp directory per conversion to avoid stale file conflicts
    let convert_id = Uuid::new_v4();
    let tmp_dir = std::env::temp_dir().join(format!("papercut_convert_{}", convert_id));
    std::fs::create_dir_all(&tmp_dir)
        .map_err(|e| format!("Failed to create temp dir: {}", e))?;
    let tmp_dir_str = tmp_dir.to_string_lossy().to_string();

    // Isolated user profile so LibreOffice doesn't conflict with running instances
    let lo_profile_dir = std::env::temp_dir().join("papercut_lo_profile");
    std::fs::create_dir_all(&lo_profile_dir).ok();
    let lo_profile_url = format!("file://{}", lo_profile_dir.to_string_lossy());

    // Try "soffice" first; on macOS it may not be in PATH
    let soffice_cmd = if cfg!(target_os = "macos") {
        let macos_path = "/Applications/LibreOffice.app/Contents/MacOS/soffice";
        if std::path::Path::new(macos_path).exists() {
            macos_path.to_string()
        } else {
            "soffice".to_string()
        }
    } else {
        "soffice".to_string()
    };

    // Build args for LibreOffice conversion
    // PDF input requires --infilter=writer_pdf_import to route through Writer (not Draw)
    // and explicit export filter names for each output format.
    let source_ext = std::path::Path::new(&source_path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    let is_pdf_input = source_ext == "pdf";

    // Map output format to LibreOffice export filter name (needed for PDF input)
    let convert_to_arg = if is_pdf_input {
        match output_format.as_str() {
            "docx" => "docx:MS Word 2007 XML".to_string(),
            "doc" => "doc:MS Word 97".to_string(),
            "odt" => "odt:writer8".to_string(),
            "txt" => "txt:Text".to_string(),
            "rtf" => "rtf:Rich Text Format".to_string(),
            "pdf" => "pdf:writer_pdf_Export".to_string(),
            _ => output_format.clone(),
        }
    } else {
        output_format.clone()
    };

    let mut args: Vec<String> = vec![
        "--headless".to_string(),
        "--norestore".to_string(),
        format!("-env:UserInstallation={}", lo_profile_url),
    ];
    if is_pdf_input {
        args.push("--infilter=writer_pdf_import".to_string());
    }
    args.extend([
        "--convert-to".to_string(),
        convert_to_arg,
        "--outdir".to_string(),
        tmp_dir_str.clone(),
        source_path.clone(),
    ]);

    let args_refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();

    let (mut rx, _child) = app
        .shell()
        .command(&soffice_cmd)
        .args(&args_refs)
        .spawn()
        .map_err(|e| format!("LibreOffice not found or failed to start. Install LibreOffice and ensure 'soffice' is in your PATH. Error: {}", e))?;

    // Wait for completion using spawn + event loop pattern
    let mut stderr_lines: Vec<String> = Vec::new();
    let mut stdout_lines: Vec<String> = Vec::new();
    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Terminated(payload) => {
                if payload.code != Some(0) {
                    // Clean up temp dir and LO profile
                    let _ = std::fs::remove_dir_all(&tmp_dir);
                    let _ = std::fs::remove_dir_all(&lo_profile_dir);
                    let all_output = [
                        stderr_lines.join("\n"),
                        stdout_lines.join("\n"),
                    ].join("\n").trim().to_string();
                    return Err(format!(
                        "LibreOffice conversion failed (exit {}): {}",
                        payload.code.unwrap_or(-1),
                        if all_output.is_empty() { "(no output)".to_string() } else { all_output }
                    ));
                }
                break;
            }
            CommandEvent::Stderr(line) => {
                stderr_lines.push(String::from_utf8_lossy(&line).to_string());
            }
            CommandEvent::Stdout(line) => {
                stdout_lines.push(String::from_utf8_lossy(&line).to_string());
            }
            CommandEvent::Error(e) => {
                let _ = std::fs::remove_dir_all(&tmp_dir);
                let _ = std::fs::remove_dir_all(&lo_profile_dir);
                return Err(format!("LibreOffice error: {}", e));
            }
            _ => {}
        }
    }

    // Construct output filename: same stem as source + new extension
    let source_stem = std::path::Path::new(&source_path)
        .file_stem()
        .and_then(|s| s.to_str())
        .ok_or("Failed to extract source filename stem")?;
    let output_path = tmp_dir.join(format!("{}.{}", source_stem, output_format));

    // LibreOffice may produce a file with a slightly different name (e.g. spaces/hyphens).
    // If the expected path doesn't exist, scan the tmp dir for any file with the right extension.
    let actual_path = if output_path.exists() {
        output_path.clone()
    } else {
        let ext = format!(".{}", output_format);
        let found = std::fs::read_dir(&tmp_dir)
            .map_err(|e| format!("Failed to read temp dir: {}", e))?
            .filter_map(|entry| entry.ok())
            .find(|entry| {
                entry.file_name().to_string_lossy().ends_with(&ext)
            })
            .map(|entry| entry.path());
        found.ok_or_else(|| {
            let files_in_dir: Vec<String> = std::fs::read_dir(&tmp_dir)
                .ok()
                .map(|rd| rd.filter_map(|e| e.ok())
                    .map(|e| e.file_name().to_string_lossy().to_string())
                    .collect())
                .unwrap_or_default();
            format!(
                "LibreOffice conversion produced no output file. Expected: {}. Files in tmp dir: [{}]. Stdout: {}. Stderr: {}",
                output_path.display(),
                files_in_dir.join(", "),
                stdout_lines.join(" | "),
                stderr_lines.join(" | "),
            )
        })?
    };

    let bytes = std::fs::read(&actual_path)
        .map_err(|e| format!("Failed to read converted output at {}: {}", actual_path.display(), e))?;

    // Clean up temp files
    let _ = std::fs::remove_dir_all(&tmp_dir);
    let _ = std::fs::remove_dir_all(&lo_profile_dir);

    Ok(tauri::ipc::Response::new(bytes))
}

/// Convert a document/ebook using Calibre's ebook-convert (system-installed).
/// Supports epub, mobi, azw3, pdf output via the `ebook-convert` CLI.
#[tauri::command]
async fn convert_with_calibre(
    app: tauri::AppHandle,
    source_path: String,
    output_format: String,
    extra_args: Vec<String>,
) -> Result<tauri::ipc::Response, String> {
    validate_source_path(&source_path)?;
    validate_calibre_extra_args(&extra_args)?;
    // Validate output_format against allow-list
    let valid_formats = ["epub", "mobi", "azw3", "pdf"];
    if !valid_formats.contains(&output_format.as_str()) {
        return Err(format!(
            "Invalid output format '{}'. Must be one of: {}",
            output_format,
            valid_formats.join(", ")
        ));
    }

    // Construct temp output path: temp_dir + UUID + new extension
    let output_path = std::env::temp_dir().join(format!(
        "papercut_calibre_{}.{}",
        Uuid::new_v4(), output_format
    ));
    let output_path_str = output_path.to_string_lossy().to_string();

    // Try ebook-convert; on macOS check Calibre app bundle path
    let ebook_convert_cmd = if cfg!(target_os = "macos") {
        let macos_path = "/Applications/calibre.app/Contents/MacOS/ebook-convert";
        if std::path::Path::new(macos_path).exists() {
            macos_path.to_string()
        } else {
            "ebook-convert".to_string()
        }
    } else {
        "ebook-convert".to_string()
    };

    let mut args = vec![source_path.clone(), output_path_str.clone()];
    args.extend(extra_args);

    let arg_refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();

    let (mut rx, _child) = app
        .shell()
        .command(&ebook_convert_cmd)
        .args(&arg_refs)
        .spawn()
        .map_err(|e| format!("Calibre ebook-convert not found or failed to start. Install Calibre and ensure 'ebook-convert' is in your PATH. Error: {}", e))?;

    // Wait for completion using spawn + event loop pattern
    let mut stderr_lines: Vec<String> = Vec::new();
    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Terminated(payload) => {
                if payload.code != Some(0) {
                    let _ = std::fs::remove_file(&output_path);
                    let stderr = stderr_lines.join("\n");
                    return Err(format!(
                        "Calibre conversion failed (exit {}): {}",
                        payload.code.unwrap_or(-1),
                        stderr
                    ));
                }
                break;
            }
            CommandEvent::Stderr(line) => {
                stderr_lines.push(String::from_utf8_lossy(&line).to_string());
            }
            CommandEvent::Error(e) => {
                let _ = std::fs::remove_file(&output_path);
                return Err(format!("Calibre error: {}", e));
            }
            _ => {}
        }
    }

    let bytes = std::fs::read(&output_path)
        .map_err(|e| format!("Failed to read converted output: {}", e))?;

    // Clean up temp file
    let _ = std::fs::remove_file(&output_path);

    Ok(tauri::ipc::Response::new(bytes))
}

/// Detect which document conversion tools are available on the user's system.
/// Returns a JSON object with boolean flags for each backend.
/// Cached in TypeScript after first call — runs detection once per app launch.
#[tauri::command]
async fn detect_converters() -> Result<String, String> {
    let mut results = std::collections::HashMap::new();

    // textutil — built-in on macOS, handles doc/docx/odt/rtf/txt
    #[cfg(target_os = "macos")]
    {
        let textutil_ok = quiet_command("textutil")
            .arg("-info")
            .arg("/dev/null")
            .output()
            .is_ok();
        results.insert("textutil", textutil_ok);
    }
    #[cfg(not(target_os = "macos"))]
    {
        results.insert("textutil", false);
    }

    // Microsoft Word — check if installed
    #[cfg(target_os = "macos")]
    {
        let word_ok = std::path::Path::new("/Applications/Microsoft Word.app").exists();
        results.insert("word", word_ok);
    }
    #[cfg(target_os = "windows")]
    {
        // Check Windows registry or common install paths for Word
        let word_ok = quiet_command("powershell")
            .args(["-Command", "(Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\WINWORD.EXE' -ErrorAction SilentlyContinue) -ne $null"])
            .output()
            .map(|o| String::from_utf8_lossy(&o.stdout).trim() == "True")
            .unwrap_or(false);
        results.insert("word", word_ok);
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        results.insert("word", false);
    }

    // LibreOffice
    #[cfg(target_os = "macos")]
    {
        let lo_ok = std::path::Path::new("/Applications/LibreOffice.app").exists();
        results.insert("libreoffice", lo_ok);
    }
    #[cfg(not(target_os = "macos"))]
    {
        let lo_ok = quiet_command("soffice")
            .arg("--version")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false);
        results.insert("libreoffice", lo_ok);
    }

    // Calibre ebook-convert
    #[cfg(target_os = "macos")]
    {
        let cal_ok = std::path::Path::new("/Applications/calibre.app").exists();
        results.insert("calibre", cal_ok);
    }
    #[cfg(not(target_os = "macos"))]
    {
        // A bare `ebook-convert` only finds Calibre when it is on PATH. On
        // Ubuntu the common installs are Flatpak and Snap, and neither puts it
        // there — so a user with Calibre installed was told they had none, and
        // (before this change) had the whole Convert Document tool disabled for
        // it. Reported from a real Linux machine.
        //
        // Written inline rather than as a module-scope helper on purpose: a
        // helper whose only callers sit inside a cfg block is dead code on the
        // other targets, and `-D warnings` makes that a hard CI error. That is
        // exactly how PR #71 broke after every local check passed.
        let candidates: [(&str, &[&str]); 3] = [
            ("ebook-convert", &["--version"]),
            ("flatpak", &["run", "--command=ebook-convert", "com.calibre_ebook.calibre", "--version"]),
            ("calibre.ebook-convert", &["--version"]),
        ];
        let cal_ok = candidates.iter().any(|(bin, args)| {
            quiet_command(bin)
                .args(*args)
                .output()
                .map(|o| o.status.success())
                .unwrap_or(false)
        });
        results.insert("calibre", cal_ok);
    }

    // Pandoc
    let pandoc_ok = quiet_command("pandoc")
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);
    results.insert("pandoc", pandoc_ok);

    // Native webview HTML → PDF export (WKWebView createPDF) — macOS only for now.
    results.insert("webview", cfg!(target_os = "macos"));

    serde_json::to_string(&results)
        .map_err(|e| format!("Failed to serialize converter status: {}", e))
}

/// Convert a document using macOS built-in textutil.
/// Supports: txt, html, rtf, doc, docx, odt, wordml, webarchive.
/// Does NOT support PDF output — use another backend for PDF.
#[tauri::command]
async fn convert_with_textutil(
    source_path: String,
    output_format: String,
) -> Result<tauri::ipc::Response, String> {
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (source_path, output_format);
        Err("textutil is only available on macOS".to_string())
    }

    #[cfg(target_os = "macos")]
    {
        validate_source_path(&source_path)?;
        let valid_formats = ["txt", "html", "rtf", "doc", "docx", "odt", "wordml"];
        if !valid_formats.contains(&output_format.as_str()) {
            return Err(format!(
                "textutil does not support '{}' output. Supported: {}",
                output_format,
                valid_formats.join(", ")
            ));
        }

        let output_path = std::env::temp_dir().join(format!(
            "papercut_textutil_{}.{}",
            Uuid::new_v4(), output_format
        ));
        let output_path_str = output_path.to_string_lossy().to_string();

        let output = quiet_command("textutil")
            .args([
                "-convert", &output_format,
                "-output", &output_path_str,
                &source_path,
            ])
            .output()
            .map_err(|e| format!("textutil failed to start: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("textutil conversion failed: {}", stderr));
        }

        let bytes = std::fs::read(&output_path)
            .map_err(|e| format!("Failed to read textutil output: {}", e))?;

        let _ = std::fs::remove_file(&output_path);

        Ok(tauri::ipc::Response::new(bytes))
    }
}

/// Convert a document using Microsoft Word via AppleScript (macOS) or COM automation (Windows).
/// Particularly useful for PDF output since textutil can't produce PDFs.
#[tauri::command]
async fn convert_with_word(
    source_path: String,
    output_format: String,
) -> Result<tauri::ipc::Response, String> {
    validate_source_path(&source_path)?;
    let output_path = std::env::temp_dir().join(format!(
        "papercut_word_{}.{}",
        Uuid::new_v4(), output_format
    ));
    let output_path_str = output_path.to_string_lossy().to_string();

    // What the automation said went wrong, if it said anything.
    //
    // Held rather than returned on the spot, because a non-zero exit does not
    // mean no document was written. Reported from a real session: a conversion
    // showed a Word error and the converted file was on the Desktop anyway.
    // On macOS the script does `save as` and then hangs on Word's sandbox
    // permission dialog, so the save had already happened when osascript was
    // killed at -1712; on Windows, SaveAs2 can succeed and Close, Quit or the
    // COM release fail after it. Either way the work is done and the only
    // thing wrong is the verdict.
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    let mut automation_error: Option<String> = None;

    #[cfg(target_os = "macos")]
    {
        let word_format = match word_save_format(output_format.as_str()) {
            Some(f) => f,
            None => return Err(format!("Word does not support '{}' output", output_format)),
        };

        let applescript = format!(
            r#"
            tell application "Microsoft Word"
                activate
                -- Capture the document the open returns; relying on "active document"
                -- races against Word's open (it can be missing value → -1708 on save as).
                set theDoc to open POSIX file "{}"
                save as theDoc file name POSIX file "{}" file format {}
                close theDoc saving no
            end tell
            "#,
            source_path.replace('"', "\\\""),
            output_path_str.replace('"', "\\\""),
            word_format,
        );

        let output = quiet_command("osascript")
            .args(["-e", &applescript])
            .output()
            .map_err(|e| format!("Failed to run Word via AppleScript: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            // Held, not returned: see the note on usable_output below.
            automation_error = Some(format_word_automation_error(&stderr));
        }
    }

    #[cfg(target_os = "windows")]
    {
        // Map output format to Word COM WdSaveFormat enum values
        let wd_format = match output_format.as_str() {
            "pdf" => "17",      // wdFormatPDF
            "docx" => "16",     // wdFormatDocumentDefault
            "doc" => "0",       // wdFormatDocument (97-2003)
            "rtf" => "6",       // wdFormatRTF
            "txt" => "2",       // wdFormatText
            "odt" => "23",      // wdFormatOpenDocumentText
            _ => return Err(format!("Word does not support '{}' output", output_format)),
        };

        let ps_script = format!(
            r#"
            $word = New-Object -ComObject Word.Application
            $word.Visible = $false
            try {{
                $doc = $word.Documents.Open("{}")
                $doc.SaveAs2([ref]"{}", [ref]{})
                $doc.Close([ref]0)
            }} finally {{
                $word.Quit()
                [System.Runtime.Interopservices.Marshal]::ReleaseComObject($word) | Out-Null
            }}
            "#,
            source_path.replace('\\', "\\\\").replace('"', "`\""),
            output_path_str.replace('\\', "\\\\").replace('"', "`\""),
            wd_format,
        );

        let output = quiet_command("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", &ps_script])
            .output()
            .map_err(|e| format!("Failed to run Word via PowerShell: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            automation_error = Some(format!("Word conversion failed: {}", stderr));
        }
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = output_path_str;
        Err("Word automation is not supported on this platform".to_string())
    }

    #[cfg(any(target_os = "macos", target_os = "windows"))]
    {
        let bytes = std::fs::read(&output_path).ok().filter(|b| !b.is_empty());
        let _ = std::fs::remove_file(&output_path);

        word_outcome(bytes, automation_error).map(tauri::ipc::Response::new)
    }
}

/// Whether a Word run counts as a success, given what it wrote and what it said.
///
/// A document that exists wins over a complaint about it. The automation reports
/// failure for things that happen after the save: on macOS the script is killed
/// at -1712 while Word waits on its sandbox permission dialog, by which point
/// `save as` has already run; on Windows SaveAs2 can succeed and `Close`, `Quit`
/// or the COM release fail behind it. Reported as an error shown next to a file
/// that had converted perfectly well.
///
/// An empty file is not a document, so it is filtered out before this sees it.
#[cfg_attr(
    not(any(target_os = "macos", target_os = "windows")),
    allow(dead_code)
)]
fn word_outcome(bytes: Option<Vec<u8>>, error: Option<String>) -> Result<Vec<u8>, String> {
    match (bytes, error) {
        (Some(bytes), _) => Ok(bytes),
        (None, Some(err)) => Err(err),
        // Nothing written and nothing said: rare, and still a failure.
        (None, None) => Err("Word produced no output.".to_string()),
    }
}

/// Convert an HTML file to PDF by rendering it in a hidden native webview and
/// exporting the rendered page — the same mechanism as a browser's "Save as
/// PDF". Used instead of driving Word/LibreOffice for HTML specifically:
/// renders modern CSS/JS the way a browser would, and needs no external app
/// installed.
#[tauri::command]
async fn convert_html_to_pdf_native(
    app: tauri::AppHandle,
    source_path: String,
) -> Result<tauri::ipc::Response, String> {
    validate_source_path(&source_path)?;

    #[cfg(target_os = "macos")]
    {
        convert_html_to_pdf_macos(app, source_path).await
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        let _ = source_path;
        Err("Native HTML to PDF export is only available on macOS right now.".to_string())
    }
}

#[cfg(target_os = "macos")]
async fn convert_html_to_pdf_macos(
    app: tauri::AppHandle,
    source_path: String,
) -> Result<tauri::ipc::Response, String> {
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::{Arc, Mutex};

    let source = std::path::Path::new(&source_path);
    let dir_path_str = source
        .parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| source_path.clone());

    let window_label = format!("html2pdf-{}", Uuid::new_v4());

    // Signalled once the real HTML content (not the initial blank page) finishes loading.
    let (load_tx, load_rx) = tokio::sync::oneshot::channel::<()>();
    let load_tx = Arc::new(Mutex::new(Some(load_tx)));
    let armed = Arc::new(AtomicBool::new(false));

    let load_tx_for_hook = load_tx.clone();
    let armed_for_hook = armed.clone();

    // WKWebViewConfiguration is main-thread-only to construct, so the whole
    // window (config + builder + build()) has to happen inside one
    // run_on_main_thread dispatch rather than being built on this (tokio
    // worker) thread the way the rest of this function's `with_webview`
    // calls operate against an *existing* webview.
    //
    // The configuration turns on `allowFileAccessFromFileURLs` — by default
    // WKWebView treats every `file://` URL as its own isolated, opaque
    // origin, so a same-origin <iframe> in a saved-page bundle (e.g.
    // `page_files/resource.html`, referenced by a relative path) can't reach
    // its own parent's DOM even with `sandbox="allow-same-origin"` — the
    // sandbox attribute can only grant what the WebView's base policy
    // already allows. This is an official, if undocumented (KVC-only) WebKit
    // preference key, not a private/unstable API surface.
    let (window_tx, window_rx) = tokio::sync::oneshot::channel::<Result<tauri::WebviewWindow, String>>();
    let window_tx = Arc::new(Mutex::new(Some(window_tx)));
    let window_tx_for_main = window_tx.clone();
    let app_for_main = app.clone();
    let window_label_for_main = window_label.clone();

    let main_thread_dispatch = app.run_on_main_thread(move || {
        let result = (|| -> Result<tauri::WebviewWindow, String> {
            let mtm = objc2::MainThreadMarker::new()
                .ok_or_else(|| "Window creation did not run on the main thread.".to_string())?;
            let configuration = unsafe {
                use objc2_foundation::NSObjectNSKeyValueCoding;
                let configuration = objc2_web_kit::WKWebViewConfiguration::new(mtm);
                let preferences = configuration.preferences();
                let key = objc2_foundation::NSString::from_str("allowFileAccessFromFileURLs");
                let value = objc2_foundation::NSNumber::numberWithBool(true);
                preferences.setValue_forKey(Some(value.as_ref()), &key);
                configuration
            };

            tauri::WebviewWindowBuilder::new(
                &app_for_main,
                &window_label_for_main,
                tauri::WebviewUrl::External(url::Url::parse("about:blank").unwrap()),
            )
            .visible(false)
            .inner_size(1024.0, 1400.0)
            .with_webview_configuration(configuration)
            .on_page_load(move |_win, payload| {
                if matches!(payload.event(), tauri::webview::PageLoadEvent::Finished)
                    && armed_for_hook.load(Ordering::SeqCst)
                {
                    if let Some(tx) = load_tx_for_hook.lock().unwrap().take() {
                        let _ = tx.send(());
                    }
                }
            })
            .build()
            .map_err(|e| format!("Failed to create render surface: {}", e))
        })();

        if let Some(tx) = window_tx_for_main.lock().unwrap().take() {
            let _ = tx.send(result);
        }
    });

    if let Err(e) = main_thread_dispatch {
        return Err(format!("Failed to dispatch window creation: {}", e));
    }

    let webview_window = tokio::time::timeout(std::time::Duration::from_secs(10), window_rx)
        .await
        .map_err(|_| "Timed out creating render surface.".to_string())?
        .map_err(|_| "Render surface creation channel closed unexpectedly.".to_string())??;

    // Load the real HTML file directly through WKWebView (bypasses Tauri's URL
    // builder, which only accepts http/https) then arm the "finished" signal —
    // safe to do last since no navigation callback can fire until this closure
    // returns control to the main thread's run loop.
    let armed_for_load = armed.clone();
    let source_path_for_load = source_path.clone();
    let load_dispatch = webview_window.with_webview(move |webview| unsafe {
        let raw = webview.inner() as *mut objc2_web_kit::WKWebView;
        let wk: &objc2_web_kit::WKWebView = &*raw;
        let file_ns_url = objc2_foundation::NSURL::fileURLWithPath(
            &objc2_foundation::NSString::from_str(&source_path_for_load),
        );
        let dir_ns_url = objc2_foundation::NSURL::fileURLWithPath(
            &objc2_foundation::NSString::from_str(&dir_path_str),
        );
        wk.loadFileURL_allowingReadAccessToURL(&file_ns_url, &dir_ns_url);
        armed_for_load.store(true, Ordering::SeqCst);
    });

    if let Err(e) = load_dispatch {
        let _ = webview_window.close();
        return Err(format!("Failed to load HTML into render surface: {}", e));
    }

    if tokio::time::timeout(std::time::Duration::from_secs(20), load_rx)
        .await
        .is_err()
    {
        let _ = webview_window.close();
        return Err("Timed out rendering the HTML file.".to_string());
    }

    // Measure the page's real content height (not just the initial viewport) so
    // the render surface can be expanded to match before exporting — otherwise
    // createPDF only captures what's currently on screen, truncating anything
    // that required scrolling to reach.
    //
    // A plain top-level scrollHeight misses two common cases:
    //  - Pages that pre-compute a "true" content height into a CSS custom
    //    property for print tooling (seen on saved single-file HTML pages
    //    with an app-shell layout, e.g. "--frame-print-h").
    //  - Content that actually lives inside a same-origin-accessible <iframe>
    //    (e.g. a "Save Page As" bundle) rather than the top document itself —
    //    a position:absolute shell around such an iframe reports its own
    //    small viewport height, not the iframe's real content height.
    // Check all three signals and take the largest each poll. The top
    // document's own "finished loading" event (which gates the earlier wait)
    // fires for the main frame only — a same-origin iframe can still be
    // loading its own content after that, and also reports readyState so we
    // know whether to keep polling for it. (WKWebView's older
    // evaluateJavaScript:completionHandler: does not await a returned
    // promise, so this stays synchronous and the polling loop lives in Rust
    // instead of JS.)
    const MEASURE_JS: &str = r#"(function() {
        function docHeight(doc) {
            var d = doc.documentElement, b = doc.body;
            return Math.max(
                d ? d.scrollHeight : 0,
                b ? b.scrollHeight : 0,
                d ? d.offsetHeight : 0
            );
        }
        var best = docHeight(document);
        try {
            var hinted = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--frame-print-h'));
            if (!isNaN(hinted) && hinted > best) best = hinted;
        } catch (e) {}
        try {
            var frames = document.querySelectorAll('iframe');
            for (var i = 0; i < frames.length; i++) {
                try {
                    var inner = frames[i].contentDocument;
                    if (inner) {
                        var h = docHeight(inner);
                        if (h > best) best = h;
                    }
                } catch (e) {}
            }
        } catch (e) {}
        return best;
    })()"#;

    let measure_once = |webview_window: &tauri::WebviewWindow| -> tokio::sync::oneshot::Receiver<f64> {
        let (height_tx, height_rx) = tokio::sync::oneshot::channel::<f64>();
        let height_tx = Arc::new(Mutex::new(Some(height_tx)));
        let height_tx_for_block = height_tx.clone();

        let dispatch = webview_window.with_webview(move |webview| unsafe {
            let raw = webview.inner() as *mut objc2_web_kit::WKWebView;
            let wk: &objc2_web_kit::WKWebView = &*raw;
            let js = objc2_foundation::NSString::from_str(MEASURE_JS);

            let block = block2::RcBlock::new(
                move |result: *mut objc2::runtime::AnyObject, _error: *mut objc2_foundation::NSError| {
                    let height = if result.is_null() {
                        0.0
                    } else {
                        (*result)
                            .downcast_ref::<objc2_foundation::NSNumber>()
                            .map(|n| n.doubleValue())
                            .unwrap_or(0.0)
                    };
                    if let Some(tx) = height_tx_for_block.lock().unwrap().take() {
                        let _ = tx.send(height);
                    }
                },
            );

            wk.evaluateJavaScript_completionHandler(&js, Some(&block));
        });
        if dispatch.is_err() {
            if let Some(tx) = height_tx.lock().unwrap().take() {
                let _ = tx.send(0.0);
            }
        }
        height_rx
    };

    // Poll for up to ~2s: a same-origin iframe (e.g. a saved-page bundle)
    // typically finishes its own load within a couple hundred ms of the
    // outer page, but there's no event to await for that specifically.
    let mut measured_height: f64 = 0.0;
    for _ in 0..14 {
        let sample = tokio::time::timeout(std::time::Duration::from_secs(5), measure_once(&webview_window))
            .await
            .ok()
            .and_then(|r| r.ok())
            .unwrap_or(0.0);
        if sample > measured_height {
            measured_height = sample;
        }
        tokio::time::sleep(std::time::Duration::from_millis(150)).await;
    }

    // Capture as letter-proportioned page-sized slices and merge them into one
    // multi-page PDF, instead of one createPDF call over the whole (now very
    // tall) render surface. WebKit silently re-splits any single PDF page
    // taller than ~14,400pt at an arbitrary pixel boundary — not a paragraph
    // or section break — which is what produced odd-looking 1-2-page output
    // for tall documents. Slicing ourselves at a normal page height gives a
    // page count and thumbnail strip that looks like a real printed document.
    const PAGE_WIDTH_PX: f64 = 1024.0;
    const PAGE_HEIGHT_PX: f64 = 1325.0; // letter aspect ratio (11/8.5) at PAGE_WIDTH_PX

    // Clamp to a sane range: never shrink below one page, never grow past a
    // size that would make export pathologically slow.
    let target_height = measured_height.clamp(PAGE_HEIGHT_PX, 50_000.0);

    if target_height > PAGE_HEIGHT_PX {
        let _ = webview_window.set_size(tauri::LogicalSize::new(PAGE_WIDTH_PX, target_height));
        // Resizing doesn't fire a page-load event we can await, so give WebKit
        // a short, fixed window to relayout before capturing.
        tokio::time::sleep(std::time::Duration::from_millis(300)).await;
    }

    let total_height = target_height;
    // Round rather than ceil, and re-divide height evenly across that many
    // pages — a fixed PAGE_HEIGHT_PX chunk size leaves a near-empty sliver of
    // a final page whenever content is just over a page boundary (e.g. 1400px
    // of content into 1325px pages). Rounding keeps content that's basically
    // "one page's worth" as one (slightly taller) page instead.
    let num_pages = ((total_height / PAGE_HEIGHT_PX).round() as usize).max(1);
    let page_height = total_height / num_pages as f64;

    let capture_page = |webview_window: &tauri::WebviewWindow, y: f64, h: f64| -> tokio::sync::oneshot::Receiver<Result<Vec<u8>, String>> {
        let (tx, rx) = tokio::sync::oneshot::channel::<Result<Vec<u8>, String>>();
        let tx = Arc::new(Mutex::new(Some(tx)));
        let tx_for_block = tx.clone();

        let dispatch = webview_window.with_webview(move |webview| unsafe {
            let raw = webview.inner() as *mut objc2_web_kit::WKWebView;
            let wk: &objc2_web_kit::WKWebView = &*raw;

            let mtm = match objc2::MainThreadMarker::new() {
                Some(m) => m,
                None => {
                    if let Some(tx) = tx_for_block.lock().unwrap().take() {
                        let _ = tx.send(Err("Page capture did not run on the main thread.".to_string()));
                    }
                    return;
                }
            };
            let config = objc2_web_kit::WKPDFConfiguration::new(mtm);
            config.setRect(objc2_core_foundation::CGRect {
                origin: objc2_core_foundation::CGPoint { x: 0.0, y },
                size: objc2_core_foundation::CGSize { width: PAGE_WIDTH_PX, height: h },
            });

            let block = block2::RcBlock::new(
                move |data: *mut objc2_foundation::NSData, error: *mut objc2_foundation::NSError| {
                    let result = if !error.is_null() {
                        Err(format!("Page export failed: {}", &*error))
                    } else if !data.is_null() {
                        Ok((*data).to_vec())
                    } else {
                        Err("Page export returned no data.".to_string())
                    };
                    if let Some(tx) = tx_for_block.lock().unwrap().take() {
                        let _ = tx.send(result);
                    }
                },
            );

            wk.createPDFWithConfiguration_completionHandler(Some(&config), &block);
        });
        if dispatch.is_err() {
            if let Some(tx) = tx.lock().unwrap().take() {
                let _ = tx.send(Err("Failed to dispatch page export.".to_string()));
            }
        }
        rx
    };

    let mut page_datas: Vec<Vec<u8>> = Vec::with_capacity(num_pages);
    for i in 0..num_pages {
        let y = i as f64 * page_height;
        let h = (total_height - y).min(page_height);
        let outcome = tokio::time::timeout(
            std::time::Duration::from_secs(30),
            capture_page(&webview_window, y, h),
        )
        .await;
        match outcome {
            Ok(Ok(Ok(bytes))) => page_datas.push(bytes),
            Ok(Ok(Err(e))) => {
                let _ = webview_window.close();
                return Err(e);
            }
            Ok(Err(_)) => {
                let _ = webview_window.close();
                return Err("Page export channel closed unexpectedly.".to_string());
            }
            Err(_) => {
                let _ = webview_window.close();
                return Err(format!("Timed out exporting page {} of {}.", i + 1, num_pages));
            }
        }
    }

    let _ = webview_window.close();

    // PDFDocument/PDFPage aren't main-thread-restricted, so this merge can
    // run right here on the async command's own thread.
    unsafe {
        use objc2::AnyThread;

        let combined = objc2_pdf_kit::PDFDocument::new();
        for (i, data) in page_datas.iter().enumerate() {
            let ns_data = objc2_foundation::NSData::with_bytes(data);
            let doc = objc2_pdf_kit::PDFDocument::initWithData(
                objc2_pdf_kit::PDFDocument::alloc(),
                &ns_data,
            )
            .ok_or_else(|| format!("Failed to parse exported page {}.", i + 1))?;
            let page = doc
                .pageAtIndex(0)
                .ok_or_else(|| format!("Missing content on page {}.", i + 1))?;
            combined.insertPage_atIndex(&page, i);
        }

        let bytes = combined
            .dataRepresentation()
            .ok_or_else(|| "Failed to assemble the final PDF.".to_string())?
            .to_vec();

        Ok(tauri::ipc::Response::new(bytes))
    }
}

/// Human-readable OS label plus the real CPU architecture.
///
/// The webview's `navigator.platform` reports "MacIntel" on every Mac —
/// Apple Silicon included — so a crash report built from it can never tell an
/// aarch64 build from an x86_64 one. That distinction matters here because the
/// Ghostscript sidecar is architecture-specific.
fn format_system_info(os: &str, arch: &str) -> String {
    let label = match os {
        "macos" => "macOS",
        "windows" => "Windows",
        "linux" => "Linux",
        other => other,
    };
    format!("{label} ({arch})")
}

/// Reports the OS and architecture this binary was actually built for.
#[tauri::command]
fn system_info() -> String {
    format_system_info(std::env::consts::OS, std::env::consts::ARCH)
}

/// Grants read access to files the user dragged onto the window.
///
/// Tauri treats the two ways a file arrives differently. A file picked through
/// a dialog is granted in the fs plugin's runtime scope by tauri-plugin-dialog.
/// A file that is dragged in is not: tauri core widens `tauri::scope::Scopes`,
/// which carries the asset protocol alone and is not what tauri-plugin-fs
/// consults when it resolves a path. So a dropped file from outside the roots
/// in `capabilities/default.json` could not be read, and the app reported that
/// as a corrupt document.
///
/// Granting one file at a time, rather than widening the capability to
/// `$HOME/**`, keeps the app's reach to the files this person handed it.
///
/// Note this deliberately does not call `validate_source_path`. That guard
/// exists to keep shell-dangerous characters away from the commands that spawn
/// Ghostscript, Calibre and `open`; this command spawns nothing, and its
/// filename allow-list would reject ordinary documents like `John's CV.pdf`.
/// The checks that do matter here — no null bytes, no traversal, a real file —
/// are applied directly.
#[tauri::command]
fn allow_dropped_paths(app: tauri::AppHandle, paths: Vec<String>) -> Result<(), String> {
    use tauri_plugin_fs::FsExt;

    let scope = app
        .try_fs_scope()
        .ok_or_else(|| "Filesystem scope is unavailable".to_string())?;

    for path in &paths {
        if path.is_empty() || path.contains('\0') || path.len() > 4096 {
            return Err("Invalid file path".to_string());
        }
        let candidate = std::path::Path::new(path);
        if candidate
            .components()
            .any(|c| matches!(c, std::path::Component::ParentDir))
        {
            return Err("Path traversal not allowed".to_string());
        }
        // Only real files. A grant means nothing for a path that is not there,
        // and this keeps a dropped directory from being opened up wholesale.
        if !candidate.is_file() {
            return Err(format!("Not a file: {}", path));
        }
        scope
            .allow_file(path)
            .map_err(|e| format!("Could not grant access to {}: {}", path, e))?;
    }

    Ok(())
}

/// Reveal a file in Finder (macOS) or the system file manager.
#[tauri::command]
async fn reveal_in_finder(path: String) -> Result<(), String> {
    validate_source_path(&path)?;
    #[cfg(target_os = "macos")]
    {
        quiet_command("open")
            .args(["-R", &path])
            .spawn()
            .map_err(|e| format!("Failed to reveal in Finder: {}", e))?;
    }
    #[cfg(target_os = "windows")]
    {
        quiet_command("explorer")
            .args(["/select,", &path])
            .spawn()
            .map_err(|e| format!("Failed to reveal in Explorer: {}", e))?;
    }
    #[cfg(target_os = "linux")]
    {
        // Try xdg-open on parent directory
        let parent = std::path::Path::new(&path)
            .parent()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|| path.clone());
        quiet_command("xdg-open")
            .arg(&parent)
            .spawn()
            .map_err(|e| format!("Failed to open file manager: {}", e))?;
    }
    Ok(())
}

// ─── Saving over the file the user opened ────────────────────────────────────

/// Replace `target`'s contents without ever truncating `target` itself.
///
/// Since PR #85, Save writes back over the document the flow was opened with,
/// so this runs against the user's only copy. `tauri-plugin-fs`'s `writeFile`
/// opens with `O_TRUNC | O_CREAT`, which means two things that are wrong for
/// that job:
///
///   - the original is zero bytes from the moment the file opens until the
///     last byte lands. Measured on a 50,000-byte file: 0 bytes after open,
///     before a single byte of the replacement is written. A full disk, an I/O
///     error, or a crash inside that window leaves a truncated scan and no
///     copy of what it replaced.
///   - `create: true` means a document deleted or renamed while the tool was
///     open is silently recreated at its old path, and the save reports success.
///
/// So: write a sibling temporary file, fsync it, then `rename` it over the
/// target. `rename(2)` (and `MoveFileEx` with `REPLACE_EXISTING`) is atomic, so
/// a reader sees either the whole old file or the whole new one and never a
/// partial write. The temporary has to be a *sibling* rather than live in the
/// system temp directory, because a rename across filesystems fails and the
/// copy it would fall back to is exactly the non-atomic write being avoided.
///
/// Errors are returned with a machine-readable prefix rather than a sentence,
/// because the interface has to tell these apart: every one of them used to
/// reach the user as "Could not write file. Check that you have permission to
/// write to the selected location." — which named the wrong cause for three of
/// the four, and named a location the user never selected.
fn atomic_replace(target: &std::path::Path, data: &[u8]) -> Result<(), String> {
    use std::io::Write;

    let parent = target
        .parent()
        .ok_or_else(|| format!("NO_DIR:{}", target.display()))?;
    let file_name = target
        .file_name()
        .ok_or_else(|| format!("NO_DIR:{}", target.display()))?
        .to_string_lossy()
        .to_string();
    if !parent.is_dir() {
        return Err(format!("NO_DIR:{}", parent.display()));
    }

    // Pre-flight the target's own write permission, and do it by opening the
    // file the way a direct write would — without O_TRUNC, so the probe cannot
    // itself destroy anything.
    //
    // This check is not optional dressing: rename(2) needs write permission on
    // the *directory*, not on the file, so an atomic replace would happily
    // overwrite a 0444 file that a direct write correctly refuses. Making the
    // save safe would otherwise have made it ignore a read-only flag.
    let permissions = match std::fs::metadata(target) {
        Ok(meta) => {
            std::fs::OpenOptions::new()
                .write(true)
                .open(target)
                .map_err(|e| match e.kind() {
                    std::io::ErrorKind::PermissionDenied => format!("READ_ONLY:{file_name}"),
                    _ => format!("WRITE_FAILED:{e}"),
                })?;
            Some(meta.permissions())
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            return Err(format!("TARGET_GONE:{file_name}"));
        }
        Err(e) => return Err(format!("WRITE_FAILED:{e}")),
    };

    let tmp = parent.join(format!(
        ".papercut_save_{}_{}.tmp",
        std::process::id(),
        Uuid::new_v4().simple()
    ));

    let written = (|| -> std::io::Result<()> {
        let mut file = std::fs::File::create(&tmp)?;
        file.write_all(data)?;
        // Without this the rename can be durable while the contents are not,
        // which trades a truncated file for an empty one after a power loss.
        file.sync_all()
    })();

    if let Err(e) = written {
        let _ = std::fs::remove_file(&tmp);
        return Err(match e.kind() {
            std::io::ErrorKind::PermissionDenied => format!("FOLDER_READ_ONLY:{file_name}"),
            _ if e.raw_os_error() == Some(28) => format!("DISK_FULL:{file_name}"),
            _ => format!("WRITE_FAILED:{e}"),
        });
    }

    // A fresh inode carries the umask, not the user's own mode, so a document
    // they had set to 0600 would quietly come back 0644.
    if let Some(mode) = permissions {
        let _ = std::fs::set_permissions(&tmp, mode);
    }

    std::fs::rename(&tmp, target).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        format!("REPLACE_FAILED:{e}")
    })
}

/// Decode the `encodeURIComponent` form a path arrives in.
///
/// An IPC header is ASCII, and a document called `Ödeme Planı.pdf` is not, so
/// the webview percent-encodes it. Written here rather than pulled in as a
/// crate: this is the whole of what is needed, and a dependency for it would
/// need agreement under rule R012.
fn percent_decode_utf8(input: &[u8]) -> Option<String> {
    let mut out = Vec::with_capacity(input.len());
    let mut i = 0;
    while i < input.len() {
        if input[i] == b'%' {
            let hex = input.get(i + 1..i + 3)?;
            let byte = u8::from_str_radix(std::str::from_utf8(hex).ok()?, 16).ok()?;
            out.push(byte);
            i += 3;
        } else {
            out.push(input[i]);
            i += 1;
        }
    }
    String::from_utf8(out).ok()
}

/// Whether `target` sits inside one of the roots the app is allowed to write to.
///
/// `save_over_file` is a first-party command, so it does not get the scope check
/// `tauri-plugin-fs` applies to `writeFile` -- and the write it performs is the
/// most destructive one in the app. This puts the same boundary back.
///
/// Both halves are needed and neither is sufficient. `roots` mirrors the static
/// `fs:allow-write-file` allow-list in `capabilities/default.json`, which is
/// what lets a file opened through a file association work -- that path never
/// grants anything at runtime. `granted` is the runtime scope, which is where a
/// file picked in a dialog or dropped on the window lands (the dialog plugin
/// calls `allow_file` itself; drops go through `allow_dropped_paths`), and is
/// the only thing that covers a document outside all four roots.
fn is_writable_target(target: &std::path::Path, roots: &[std::path::PathBuf], granted: bool) -> bool {
    if granted {
        return true;
    }
    // Compare against the parent: the target itself may have been deleted, and
    // canonicalize fails on a path that is not there.
    let parent = match target.parent().and_then(|p| p.canonicalize().ok()) {
        Some(p) => p,
        None => return false,
    };
    roots
        .iter()
        .filter_map(|r| r.canonicalize().ok())
        .any(|root| parent.starts_with(&root))
}

/// Save over an existing document, atomically. See `atomic_replace`.
///
/// Bytes arrive as a raw IPC body rather than a command argument: a JSON array
/// of 30 million numbers is not a reasonable way to move a scan across the
/// bridge. This is the shape `tauri-plugin-fs` uses for the same reason.
///
/// `validate_source_path`'s filename allow-list is deliberately not applied.
/// It exists to keep shell-hostile characters out of the Ghostscript command
/// line; nothing here reaches a shell, and rejecting an `&` in a filename would
/// refuse to save a document the app had just opened.
#[tauri::command]
async fn save_over_file(app: tauri::AppHandle, request: tauri::ipc::Request<'_>) -> Result<(), String> {
    let raw = request
        .headers()
        .get("path")
        .ok_or_else(|| "WRITE_FAILED:missing file path".to_string())?;
    let path = percent_decode_utf8(raw.as_bytes())
        .ok_or_else(|| "WRITE_FAILED:path is not valid UTF-8".to_string())?;

    if path.is_empty() || path.contains('\0') || path.len() > 4096 {
        return Err("WRITE_FAILED:invalid file path".to_string());
    }

    let data = match request.body() {
        tauri::ipc::InvokeBody::Raw(data) => data.clone(),
        _ => return Err("WRITE_FAILED:unexpected request body".to_string()),
    };

    {
        use tauri::Manager;
        use tauri_plugin_fs::FsExt;
        let target = std::path::Path::new(&path);
        let granted = app
            .try_fs_scope()
            .map(|scope| scope.is_allowed(target))
            .unwrap_or(false);
        let resolver = app.path();
        let roots: Vec<std::path::PathBuf> = [
            resolver.document_dir(),
            resolver.download_dir(),
            resolver.desktop_dir(),
            resolver.temp_dir(),
        ]
        .into_iter()
        .flatten()
        .collect();
        if !is_writable_target(target, &roots, granted) {
            return Err("FORBIDDEN:not a location PaperOtter may write to".to_string());
        }
    }

    tauri::async_runtime::spawn_blocking(move || {
        atomic_replace(std::path::Path::new(&path), &data)
    })
    .await
    .map_err(|e| format!("WRITE_FAILED:{e}"))?
}

/// Emit a drag-drop payload as though the OS had delivered one. **Test builds only.**
///
/// WebDriver cannot synthesise a native drop into a Tauri webview: the event
/// originates in the window manager, not in the page, and there is no script
/// path to it. Without this, the one defect that needed the most real-world
/// evidence -- a second dropped file replacing the first instead of joining it,
/// reported on both macOS and Ubuntu -- could only ever be covered in jsdom.
///
/// Be clear about what a test using this proves: it exercises the real app's
/// real handler with the payload shape Tauri delivers. It does **not** prove the
/// OS-to-Tauri boundary, which stays untested by anything we can automate.
///
/// Gated behind the `e2e` feature, which is never enabled in a release build.
#[cfg(feature = "e2e")]
#[tauri::command]
fn e2e_emit_drop(app: tauri::AppHandle, paths: Vec<String>) -> Result<(), String> {
    use tauri::Emitter;
    // The same shape `onDragDropEvent` hands the webview, so the frontend
    // listener cannot tell this apart from a real drop -- which is the point.
    app.emit(
        "tauri://drag-drop",
        serde_json::json!({ "type": "drop", "paths": paths, "position": { "x": 0, "y": 0 } }),
    )
    .map_err(|e| format!("could not emit drop: {e}"))
}

/// Replaces the value after password-related flags with [REDACTED].
/// Sweep orphan temp files from crashed sessions.
/// Deletes any file/directory in the system temp dir matching "papercut_*"
/// that was last modified more than 1 hour ago.
fn sweep_papercut_temp_files() {
    let temp = std::env::temp_dir();
    let threshold = std::time::Duration::from_secs(3600); // 1 hour

    if let Ok(entries) = std::fs::read_dir(&temp) {
        for entry in entries.flatten() {
            let name = entry.file_name();
            let name_str = name.to_string_lossy();
            if name_str.starts_with("papercut_") {
                if let Ok(meta) = entry.metadata() {
                    if let Ok(modified) = meta.modified() {
                        if modified.elapsed().unwrap_or_default() > threshold {
                            let path = entry.path();
                            if path.is_dir() {
                                let _ = std::fs::remove_dir_all(&path);
                            } else {
                                let _ = std::fs::remove_file(&path);
                            }
                        }
                    }
                }
            }
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    run_with_file(None)
}

/// Run the app, optionally opening a file passed via CLI argument (macOS "Open
///
/// The self-test deliberately goes through the *same* builder and setup as the
/// real app. Checking `resource_dir()` from a synthetic Tauri instance would
/// prove something about that instance, not about the installed tree the user
/// actually runs, which is the whole question REL-01 asks.
pub fn run_with_file(open_file: Option<String>) {
    let builder = tauri::Builder::default()
        .manage(ProcessState { cancel: Arc::new(AtomicBool::new(false)) })
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .invoke_handler({
            // The e2e-only commands are registered in a separate generate_handler!
            // so the release list stays exactly what it was -- a #[cfg] inside the
            // macro is easy to misread as shipping.
            #[cfg(not(feature = "e2e"))]
            { tauri::generate_handler![greet, process_image, rotate_image, decode_heic_preview, heic_frame_count, ocr_pdf, ocr_languages, write_searchable_pdf, compress_pdf, cancel_processing, repair_pdf, convert_with_libreoffice, convert_with_calibre, convert_with_textutil, convert_with_word, convert_html_to_pdf_native, detect_converters, reveal_in_finder, system_info, allow_dropped_paths, save_over_file] }
            #[cfg(feature = "e2e")]
            { tauri::generate_handler![greet, process_image, rotate_image, decode_heic_preview, heic_frame_count, ocr_pdf, ocr_languages, write_searchable_pdf, compress_pdf, cancel_processing, repair_pdf, convert_with_libreoffice, convert_with_calibre, convert_with_textutil, convert_with_word, convert_html_to_pdf_native, detect_converters, reveal_in_finder, system_info, allow_dropped_paths, save_over_file, e2e_emit_drop] }
        });

    // E2E automation plugin — gated behind the `e2e` Cargo feature so it is
    // deterministically included only when explicitly requested (e.g.
    // `tauri build --debug --features e2e`). Never compiled into release.
    #[cfg(feature = "e2e")]
    let builder = builder.plugin(tauri_plugin_webdriver_automation::init());

    builder
        .setup(move |app| {
            sweep_papercut_temp_files();

            // If a PDF file was passed via CLI, emit a "file-opened" event to the frontend
            if let Some(ref file_path) = open_file {
                let handle = app.handle().clone();
                let path = file_path.clone();
                // Delay slightly so the webview has time to mount and register listeners
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(500));
                    let _ = handle.emit("file-opened", path);
                });
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, _event| {
            // Handle macOS "Open With" when app is already running
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { urls } = &_event {
                for url in urls {
                    let path: String = url.to_string();
                    // url may be a file:// URL or a plain path
                    let file_path = if path.starts_with("file://") {
                        url.to_file_path().ok().and_then(|p| p.to_str().map(|s| s.to_string()))
                    } else {
                        Some(path)
                    };
                    if let Some(fp) = file_path {
                        if fp.ends_with(".pdf") {
                            let _ = _app_handle.emit("file-opened", fp);
                        }
                    }
                }
            }
        });
}

// ─── Unit tests ───────────────────────────────────────────────────────────────
//
// These tests call encode_image() directly — no Tauri window required.
// Run with: cargo test --lib  (from src-tauri/)
//
// Covers:
//   IC-02 / IC-03  — JPEG quality 1% vs 50% vs 100% produce measurably different sizes
//   IC-06          — PNG quality is INVERTED: quality 1 = max compression = smallest file
//   IC-07          — WebP quality produces real size differences
//   IF-02          — Transparent PNG → JPEG fills transparent area with white (not black)
//   IR-01/IR-03    — Resize outputs correct dimensions
//   IR-02          — Resized output is smaller in bytes than full-size
//   IR-05          — Aspect-preserving resize fits within target bounds
//
//   PC-GS-01       — compress_pdf preset allow-list: 'screen', 'ebook', 'printer', 'prepress'
//                    Full GS integration tests (actual subprocess) live in pdfProcessor.test.ts
//                    on the TypeScript side where the Tauri command can be mocked/invoked.

#[cfg(test)]
mod tests {
    /// [NO-GS] Ghostscript is gone, and stays gone.
    ///
    /// The inverse of a test that used to assert a `papercut-gs-*` binary was
    /// present. Removing something across ninety files is easy to half-finish,
    /// and a stray sidecar or a re-added invocation would not otherwise fail
    /// anything — compression would simply start depending on an AGPL binary
    /// again, quietly, which is the whole thing this was done to prevent.
    #[test]
    fn no_ghostscript_remains_anywhere_in_the_crate() {
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));

        assert!(
            !root.join("binaries").exists(),
            "src-tauri/binaries/ is back — a sidecar is being shipped again"
        );

        // Code only, comments deliberately exempt. Notes explaining why
        // Ghostscript went, and what it used to do, are history worth keeping —
        // a guard that banned the name would delete its own explanation, and
        // this one would trip on the very list below.
        //
        // The needles are split so this test does not match itself, which is
        // exactly how the first version of it failed.
        let needles = [
            concat!("-sDEVICE", "=pdfwrite"),
            concat!("-dPDF", "SETTINGS"),
            concat!("spawn", "_gs"),
            concat!("papercut", "-gs"),
        ];
        for file in ["lib.rs", "pdfcompress.rs", "ocr.rs", "heic.rs", "main.rs"] {
            let Ok(text) = std::fs::read_to_string(root.join("src").join(file)) else { continue };
            let code: String = text
                .lines()
                .filter(|l| !l.trim_start().starts_with("//"))
                .collect::<Vec<_>>()
                .join("\n");
            for needle in needles {
                assert!(
                    !code.contains(needle),
                    "{file} still invokes Ghostscript: found {needle:?} outside a comment"
                );
            }
        }
    }


    // ─── Calibre allow-list must accept what the TS side always sends ─────────

    use super::validate_calibre_extra_args;

    /// The allow-list still does its actual job: an unrecognised flag is rejected.
    /// [CALIBRE-ARGS-01] The Calibre allow-list must accept the flags
    /// buildCalibreArgs() sends on every call, unconditionally.
    ///
    /// Reported from a real build: every Convert Document run through Calibre
    /// failed with "Unsupported conversion option: --enable-heuristics".
    /// documentConverter.ts's buildCalibreArgs() pushes --enable-heuristics and
    /// --unsmarten-punctuation before any user option is even read, so they are
    /// present on every single call -- but CALIBRE_ALLOWED_FLAGS was written six
    /// days after that function existed, and never learned about either.
    ///
    /// This asserts the boundary directly rather than the symptom: the exact
    /// unconditional prefix buildCalibreArgs() emits, byte for byte, must clear
    /// this allow-list. If a future flag is added to one side and not the other,
    /// this fails here instead of during a user's conversion.
    #[test]
    fn calibre_allowlist_accepts_the_flags_always_sent() {
        // Mirrors buildCalibreArgs()'s unconditional prefix in documentConverter.ts:
        // pushed on every call, before fontSize/margins/lineSpacing/epubLayout.
        let always_sent = vec![
            "--enable-heuristics".to_string(),
            "--unsmarten-punctuation".to_string(),
        ];
        assert!(
            validate_calibre_extra_args(&always_sent).is_ok(),
            "the allow-list rejects flags buildCalibreArgs() sends on every conversion"
        );
    }

    #[test]
    fn calibre_allowlist_still_rejects_the_unknown() {
        let bogus = vec!["--not-a-real-calibre-flag".to_string()];
        assert!(validate_calibre_extra_args(&bogus).is_err());
    }

    // ─── commands must not encode on the UI thread ────────────────────────────

    /// [IMG-THREAD-01] A synchronous #[tauri::command] runs on the main thread,
    /// so the window stops responding for as long as it takes.
    ///
    /// Reported from a real build: converting a JPEG to PNG made the app go
    /// "not responding" until the encode finished. PNG is lossless, so a photo
    /// that arrived as a 2.4 MB JPEG has to be stored pixel for pixel and takes
    /// far longer than the JPEG and WebP paths that hid this.
    ///
    /// Reading the source is the only way to assert this: whether a command
    /// blocks the event loop is a property of how it is declared, and a test
    /// that called the function directly would pass either way.
    #[test]
    fn image_encoding_never_blocks_the_event_loop() {
        let src = include_str!("lib.rs");

        for name in ["process_image"] {
            let at = src
                .find(&format!("fn {name}("))
                .unwrap_or_else(|| panic!("{name} is gone -- update this test"));
            let decl_start = src[..at].rfind("#[tauri::command]").expect("not a command");
            let decl = &src[decl_start..at];

            assert!(
                decl.contains("async"),
                "{name} is a synchronous command, so it encodes on the main thread \
                 and the window freezes until it finishes"
            );

            let body_end = src[at..].find("\n}\n").map(|e| at + e).unwrap_or(src.len());
            assert!(
                src[at..body_end].contains("spawn_blocking"),
                "{name} is async but still does its CPU work on the async runtime \
                 thread; hand it to spawn_blocking"
            );
        }
    }

    // ─── system_info ──────────────────────────────────────────────────────────

    use super::format_system_info;

    #[test]
    fn system_info_names_macos_and_keeps_the_real_arch() {
        // navigator.platform reports "MacIntel" on Apple Silicon too, so the
        // arch must come from the Rust side to be trustworthy.
        assert_eq!(format_system_info("macos", "aarch64"), "macOS (aarch64)");
        assert_eq!(format_system_info("macos", "x86_64"), "macOS (x86_64)");
    }

    #[test]
    fn system_info_names_windows_and_linux() {
        assert_eq!(format_system_info("windows", "x86_64"), "Windows (x86_64)");
        assert_eq!(format_system_info("linux", "aarch64"), "Linux (aarch64)");
    }

    #[test]
    fn system_info_passes_through_an_unknown_os_verbatim() {
        assert_eq!(format_system_info("freebsd", "x86_64"), "freebsd (x86_64)");
    }

    #[test]
    fn system_info_reports_this_build_not_a_placeholder() {
        let info = super::system_info();
        assert!(info.contains(std::env::consts::ARCH), "got {info}");
        assert!(!info.contains("MacIntel"), "got {info}");
    }
    use super::encode_image;
    use image::codecs::jpeg::JpegEncoder;
    use image::codecs::png::{PngEncoder, CompressionType};
    use std::io::Cursor;


    /// IC-09: reported from a real Linux build — a 248 KB JPEG converted to PNG
    /// gave 1.55 MB at "1/9" and 1.45 MB at "8/9". Two outcomes across a ten-step
    /// control, because levels 1..8 all mapped to CompressionType::Default and
    /// level 9 was never reachable at all.
    #[test]
    fn png_compression_level_reaches_both_ends_of_the_slider() {
        assert_eq!(
            super::png_compression_level(1),
            9,
            "the bottom of the slider must reach level 9"
        );
        assert_eq!(
            super::png_compression_level(100),
            0,
            "the top of the slider must reach level 0"
        );
    }

    #[test]
    fn png_compression_level_covers_every_step() {
        let mut seen = [false; 10];
        for quality in 1..=100u8 {
            seen[super::png_compression_level(quality) as usize] = true;
        }
        for (level, reached) in seen.iter().enumerate() {
            assert!(reached, "level {} is unreachable from the slider", level);
        }
    }

    #[test]
    fn png_compression_uses_real_levels_not_three_named_constants() {
        assert_eq!(super::png_compression_for_quality(1), CompressionType::Level(9));
        assert_eq!(super::png_compression_for_quality(50), CompressionType::Level(5));
        assert_eq!(super::png_compression_for_quality(100), CompressionType::Fast);
    }

    /// The slider's label is drawn by `pngLevelForQuality` in TypeScript while the
    /// file is encoded here. Nothing in either language checks the other, so these
    /// are the five slider positions where the previous two formulas disagreed —
    /// if they drift apart again, the number shown is not the level used.
    #[test]
    fn png_compression_level_matches_the_typescript_label() {
        for (quality, level) in [(6u8, 9u8), (17, 8), (28, 7), (39, 6), (50, 5)] {
            assert_eq!(
                super::png_compression_level(quality),
                level,
                "quality {} should map to level {}",
                quality,
                level
            );
        }
    }

    // ─── Fixtures ─────────────────────────────────────────────────────────────

    /// Builds a high-frequency noise JPEG.
    ///
    /// A checkerboard XOR-ed with a gradient maximises DCT coefficients — meaning
    /// quality differences produce large and measurable output size differences.
    /// Plain gradients compress similarly at all qualities; noise does not.
    fn make_noisy_jpeg(width: u32, height: u32) -> Vec<u8> {
        let img = image::DynamicImage::ImageRgb8(image::RgbImage::from_fn(
            width,
            height,
            |x, y| {
                let checker = ((x + y) % 2) as u8 * 255;
                let r = checker ^ ((x * 255 / width) as u8);
                let g = checker ^ ((y * 255 / height) as u8);
                let b = (x ^ y) as u8;
                image::Rgb([r, g, b])
            },
        ));
        let mut buf = Vec::new();
        let mut enc = JpegEncoder::new_with_quality(&mut buf, 95);
        enc.encode_image(&img).expect("fixture JPEG encode failed");
        buf
    }

    /// Builds a simple gradient JPEG (used where content complexity doesn't matter).
    fn make_simple_jpeg(width: u32, height: u32) -> Vec<u8> {
        let img = image::DynamicImage::ImageRgb8(image::RgbImage::from_fn(
            width,
            height,
            |x, y| image::Rgb([(x * 255 / width) as u8, (y * 255 / height) as u8, 128u8]),
        ));
        let mut buf = Vec::new();
        let mut enc = JpegEncoder::new_with_quality(&mut buf, 90);
        enc.encode_image(&img).expect("fixture JPEG encode failed");
        buf
    }

    /// Builds an RGBA PNG: left half = opaque red, right half = fully transparent.
    fn make_transparent_png(width: u32, height: u32) -> Vec<u8> {
        let img = image::DynamicImage::ImageRgba8(image::RgbaImage::from_fn(
            width,
            height,
            |x, _y| {
                if x < width / 2 {
                    image::Rgba([255u8, 0, 0, 255]) // opaque red
                } else {
                    image::Rgba([0u8, 0, 0, 0]) // fully transparent
                }
            },
        ));
        let mut buf = Vec::new();
        let encoder = PngEncoder::new_with_quality(
            Cursor::new(&mut buf),
            CompressionType::Default,
            image::codecs::png::FilterType::Adaptive,
        );
        img.write_with_encoder(encoder).expect("fixture PNG encode failed");
        buf
    }

    // ─── IC-02 / IC-03 — JPEG quality ─────────────────────────────────────────

    /// IC-02: Quality 1% output must be substantially smaller than quality 100%.
    #[test]
    fn jpeg_quality_1_is_smaller_than_quality_100() {
        let src = make_noisy_jpeg(200, 200);
        let q1 = encode_image(&src, 1, "jpeg", None, None, false).expect("q1 failed");
        let q100 = encode_image(&src, 100, "jpeg", None, None, false).expect("q100 failed");
        assert!(
            q1.len() < q100.len(),
            "JPEG quality 1 ({} bytes) should be smaller than quality 100 ({} bytes)",
            q1.len(),
            q100.len()
        );
        // Expect at least 3× size difference on high-frequency content
        assert!(
            q100.len() >= q1.len() * 3,
            "Expected ≥3× size ratio between quality 100 and quality 1; got {}× ({} vs {} bytes)",
            q100.len() / q1.len().max(1),
            q100.len(),
            q1.len()
        );
    }

    /// IC-03: Quality 50% must be between quality 1% and 100%.
    #[test]
    fn jpeg_quality_50_is_between_q1_and_q100() {
        let src = make_noisy_jpeg(200, 200);
        let q1 = encode_image(&src, 1, "jpeg", None, None, false).expect("q1");
        let q50 = encode_image(&src, 50, "jpeg", None, None, false).expect("q50");
        let q100 = encode_image(&src, 100, "jpeg", None, None, false).expect("q100");
        assert!(q1.len() < q50.len(), "q1 should be smaller than q50");
        assert!(q50.len() < q100.len(), "q50 should be smaller than q100");
    }

    /// Output is a valid JPEG (FF D8 magic bytes).
    #[test]
    fn jpeg_output_has_jpeg_magic_bytes() {
        let src = make_simple_jpeg(80, 80);
        let out = encode_image(&src, 80, "jpeg", None, None, false).expect("encode failed");
        assert_eq!(&out[0..2], &[0xFF, 0xD8], "JPEG must start with FF D8");
    }

    // ─── IC-06 — PNG quality (inverted) ───────────────────────────────────────

    /// IC-06: PNG quality is INVERTED — quality 1 = max compression = smallest file.
    /// quality 100 = fast deflate = largest file. Opposite of JPEG.
    #[test]
    fn png_quality_1_produces_smaller_output_than_quality_100() {
        let src = make_noisy_jpeg(200, 200); // source format doesn't matter; decoded first
        let q1 = encode_image(&src, 1, "png", None, None, false).expect("q1 failed");
        let q100 = encode_image(&src, 100, "png", None, None, false).expect("q100 failed");
        assert!(
            q1.len() < q100.len(),
            "PNG quality 1 ({} bytes, max compression) should be smaller than quality 100 ({} bytes, min compression)",
            q1.len(),
            q100.len()
        );
    }

    /// Output is a valid PNG (89 50 4E 47 magic bytes).
    #[test]
    fn png_output_has_png_magic_bytes() {
        let src = make_simple_jpeg(80, 80);
        let out = encode_image(&src, 80, "png", None, None, false).expect("encode failed");
        assert_eq!(
            &out[0..4],
            &[0x89, 0x50, 0x4E, 0x47],
            "PNG must start with 89 50 4E 47"
        );
    }

    // ─── IC-07 — WebP quality ─────────────────────────────────────────────────

    /// IC-07: WebP quality 1% must be substantially smaller than quality 100%.
    #[test]
    fn webp_quality_1_is_smaller_than_quality_100() {
        let src = make_noisy_jpeg(200, 200);
        let q1 = encode_image(&src, 1, "webp", None, None, false).expect("q1 failed");
        let q100 = encode_image(&src, 100, "webp", None, None, false).expect("q100 failed");
        assert!(
            q1.len() < q100.len(),
            "WebP quality 1 ({} bytes) should be smaller than quality 100 ({} bytes)",
            q1.len(),
            q100.len()
        );
    }

    /// Output is a valid WebP (RIFF....WEBP signature).
    #[test]
    fn webp_output_has_riff_webp_signature() {
        let src = make_simple_jpeg(80, 80);
        let out = encode_image(&src, 80, "webp", None, None, false).expect("encode failed");
        assert_eq!(&out[0..4], b"RIFF", "WebP must start with RIFF");
        assert_eq!(&out[8..12], b"WEBP", "WebP must have WEBP at bytes 8-11");
    }

    // ─── IF-02 — PNG → JPEG transparent area fills white ─────────────────────

    /// IF-02: Transparent pixels in source PNG must become white (not black) in JPEG output.
    #[test]
    fn transparent_png_to_jpeg_fills_transparent_area_with_white() {
        let src = make_transparent_png(100, 100);
        // High quality to minimise JPEG artifacts on the fill check
        let out = encode_image(&src, 95, "jpeg", None, None, false).expect("encode failed");

        let decoded = image::load_from_memory(&out).expect("failed to decode output JPEG");
        let rgb = decoded.to_rgb8();

        // Right half (x ≥ 50) was fully transparent — must now be near-white
        // Allow ±15 from 255 for JPEG block artifacts
        let mut dark_pixel_count = 0u32;
        for x in 55..95u32 {
            // stay away from the boundary to avoid edge blending artifacts
            for y in 5..95u32 {
                let p = rgb.get_pixel(x, y);
                if p[0] < 200 || p[1] < 200 || p[2] < 200 {
                    dark_pixel_count += 1;
                }
            }
        }
        assert_eq!(
            dark_pixel_count, 0,
            "Transparent area should be white after JPEG conversion; found {} dark pixels (RGB < 200)",
            dark_pixel_count
        );
    }

    /// The opaque red area in the source should remain clearly red after JPEG conversion.
    #[test]
    fn opaque_pixels_retain_their_colour_after_jpeg_conversion() {
        let src = make_transparent_png(100, 100);
        let out = encode_image(&src, 95, "jpeg", None, None, false).expect("encode failed");
        let decoded = image::load_from_memory(&out).expect("decode failed");
        let rgb = decoded.to_rgb8();

        // Left half (x < 50) was opaque red — sample interior to avoid boundary blending
        let p = rgb.get_pixel(20, 50);
        assert!(p[0] > 200, "R channel should be high (red area), got {}", p[0]);
        assert!(p[1] < 100, "G channel should be low (red area), got {}", p[1]);
        assert!(p[2] < 100, "B channel should be low (red area), got {}", p[2]);
    }

    // ─── IR-01/IR-03 — Resize: correct output dimensions ─────────────────────

    /// IR-03: resize_exact produces the exact requested pixel dimensions.
    #[test]
    fn resize_exact_outputs_correct_dimensions() {
        let src = make_simple_jpeg(400, 300);
        let out = encode_image(&src, 85, "jpeg", Some(200), Some(150), true)
            .expect("encode failed");
        let decoded = image::load_from_memory(&out).expect("decode failed");
        assert_eq!(decoded.width(), 200, "output width must be 200");
        assert_eq!(decoded.height(), 150, "output height must be 150");
    }

    /// IR-02: A thumbnail (50×50) must be smaller in bytes than the full-size image.
    #[test]
    fn resize_to_thumbnail_produces_smaller_file() {
        let src = make_noisy_jpeg(400, 400);
        let full = encode_image(&src, 80, "jpeg", None, None, false).expect("full encode failed");
        let thumb = encode_image(&src, 80, "jpeg", Some(50), Some(50), true)
            .expect("thumb encode failed");
        assert!(
            thumb.len() < full.len(),
            "50×50 thumbnail ({} bytes) should be smaller than 400×400 ({} bytes)",
            thumb.len(),
            full.len()
        );
    }

    /// IR-05: Aspect-preserving resize (resize_exact=false) fits within target bounds
    /// without exceeding either dimension.
    #[test]
    fn resize_aspect_preserving_fits_within_target_bounds() {
        // 400×200 source (2:1 ratio) → fit in 100×100 box
        let src = make_simple_jpeg(400, 200);
        let out = encode_image(&src, 85, "jpeg", Some(100), Some(100), false)
            .expect("encode failed");
        let decoded = image::load_from_memory(&out).expect("decode failed");
        assert!(decoded.width() <= 100, "width must not exceed 100, got {}", decoded.width());
        assert!(decoded.height() <= 100, "height must not exceed 100, got {}", decoded.height());
        // At least one dimension should be at the bound
        let at_bound = decoded.width() == 100 || decoded.height() == 100;
        assert!(
            at_bound,
            "one dimension must be at the bound (100); got {}×{}",
            decoded.width(), decoded.height()
        );
    }

    /// Quality 30 must be substantially smaller than quality 90 (mid-range check).
    /// This complements the q1 vs q100 extreme test and covers the typical user range.
    #[test]
    fn jpeg_quality_30_substantially_smaller_than_quality_90() {
        let src = make_noisy_jpeg(400, 400);
        let q30 = encode_image(&src, 30, "jpeg", None, None, false).expect("q30 failed");
        let q90 = encode_image(&src, 90, "jpeg", None, None, false).expect("q90 failed");
        assert!(
            q30.len() < q90.len(),
            "JPEG quality 30 ({} bytes) should be smaller than quality 90 ({} bytes)",
            q30.len(),
            q90.len()
        );
        // Quality 30 should be under 70% of quality 90's size on high-frequency content
        assert!(
            (q30.len() as f64) < (q90.len() as f64) * 0.70,
            "Expected quality 30 < 70% the size of quality 90; got quality 30={} bytes, quality 90={} bytes",
            q30.len(),
            q90.len()
        );
    }

    /// JPEG source re-encoded as PNG produces valid PNG magic bytes (format conversion).
    #[test]
    fn jpeg_to_png_conversion_produces_png_magic_bytes() {
        let src = make_simple_jpeg(80, 80);
        let out = encode_image(&src, 80, "png", None, None, false).expect("jpeg→png failed");
        assert_eq!(
            &out[0..4],
            &[0x89, 0x50, 0x4E, 0x47],
            "JPEG→PNG conversion must produce PNG magic bytes (89 50 4E 47)"
        );
    }

    // ─── Error cases ──────────────────────────────────────────────────────────

    /// Unsupported output format returns a descriptive error.
    #[test]
    fn unsupported_format_returns_error() {
        let src = make_simple_jpeg(80, 80);
        let result = encode_image(&src, 80, "tiff", None, None, false);
        assert!(result.is_err(), "unsupported format should return Err");
        assert!(
            result.unwrap_err().contains("Unsupported format"),
            "error message should mention the format"
        );
    }

    /// Corrupt / non-image source bytes return a decode error.
    #[test]
    fn corrupt_source_bytes_return_error() {
        let garbage = vec![0u8, 1, 2, 3, 4, 5, 6, 7];
        let result = encode_image(&garbage, 80, "jpeg", None, None, false);
        assert!(result.is_err(), "corrupt bytes should return Err");
    }

    // ─── PC-GS-01 — compress_pdf preset allow-list ────────────────────────────
    //
    // Full GS integration tests (actual subprocess invocation on photo_heavy.pdf)
    // are on the TypeScript side (pdfProcessor.test.ts) where the Tauri command
    // can be invoked via the test harness. These unit tests validate the preset
    // allow-list logic that guards the compress_pdf command against injection.

    /// PC-GS-01: Invalid preset strings are rejected before GS is ever invoked.
    /// Old quality names ('low', 'high') and empty string must not pass.
    /// Only the four canonical GS presets are accepted.
    #[test]
    fn compress_pdf_invalid_preset_is_rejected() {
        let valid = ["screen", "ebook", "printer", "prepress"];
        assert!(valid.contains(&"screen"), "'screen' must be a valid preset");
        assert!(valid.contains(&"ebook"), "'ebook' must be a valid preset");
        assert!(valid.contains(&"printer"), "'printer' must be a valid preset");
        assert!(valid.contains(&"prepress"), "'prepress' must be a valid preset");
        assert!(!valid.contains(&"high"), "old name 'high' must not pass the allow-list");
        assert!(!valid.contains(&"low"), "old name 'low' must not pass the allow-list");
        assert!(!valid.contains(&"medium"), "old name 'medium' must not pass the allow-list");
        assert!(!valid.contains(&""), "empty string must not pass the allow-list");
        assert!(!valid.contains(&"best"), "old name 'best' must not pass the allow-list");
    }

    // ─── build_compress_pdf_args — forced re-encoding for non-archive presets ──
    //
    // Bug: a real 32MB/688-page PDF, 63% of whose image bytes were losslessly
    // FlateDecode-encoded (not the JPEG2000 initially suspected), compressed to
    // exactly 0% at every quality level. Ghostscript's presets only re-encode an
    // image when its resolution exceeds the target DPI — an already-low-resolution
    // FlateDecode image is passed through untouched even though converting it to
    // JPEG would shrink it regardless of resolution. These flags force that
    // conversion explicitly for every preset except prepress (archive), which is
    // meant to stay lossless.

    // ─── Downsampling toggle ──────────────────────────────────────────────────
    //
    // The panel has always shown a "Downsample images" checkbox, but nothing was
    // ever passed to Ghostscript -- the box did nothing at all.

    // ─── [REPAIR] rebuilding a damaged PDF ────────────────────────────────────
    //
    // The damage is made here rather than committed as fixtures: a corrupt PDF
    // in the repo is an opaque blob nobody can review, while these five are
    // each one legible edit to a known-good file, and they say in their names
    // what a real broken document looks like.

    fn sample_pdf() -> Vec<u8> {
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap()
            .join("test-fixtures")
            .join("sample.pdf");
        std::fs::read(path).expect("test-fixtures/sample.pdf")
    }

    fn rfind(haystack: &[u8], needle: &[u8]) -> Option<usize> {
        haystack
            .windows(needle.len())
            .rposition(|w| w == needle)
    }

    /// The offset table points nowhere, so a reader has to rebuild it.
    fn damage_startxref(good: &[u8]) -> Vec<u8> {
        let mut b = good.to_vec();
        let p = rfind(&b, b"startxref").expect("startxref") + 10;
        for i in p..(p + 6).min(b.len()) {
            if b[i].is_ascii_digit() {
                b[i] = b'9';
            }
        }
        b
    }

    /// The xref table and trailer are gone entirely — a truncated copy.
    fn damage_no_xref(good: &[u8]) -> Vec<u8> {
        good[..rfind(good, b"xref").expect("xref")].to_vec()
    }

    /// Junk before the header, so the file no longer starts where it claims.
    fn damage_junk_prefix(good: &[u8]) -> Vec<u8> {
        let mut b = b"GARBAGE".repeat(40);
        b.extend_from_slice(good);
        b
    }

    /// Every offset in the table shifted, so each lookup lands in the wrong place.
    fn damage_shifted_offsets(good: &[u8]) -> Vec<u8> {
        let mut b = good.to_vec();
        let p = rfind(&b, b"xref").expect("xref");
        for i in p..(p + 220).min(b.len()) {
            if b[i].is_ascii_digit() {
                b[i] = ((b[i] - b'0' + 3) % 10) + b'0';
            }
        }
        b
    }

    fn page_count(pdf_bytes: &[u8]) -> u32 {
        qpdf::QPdf::read_from_memory(pdf_bytes)
            .expect("output should load")
            .get_num_pages()
            .expect("page count")
    }

    #[test]
    fn repair_01_recovers_every_page_from_four_kinds_of_damage() {
        let good = sample_pdf();
        let original = page_count(&good);
        assert_eq!(original, 3, "the fixture is a three-page document");

        for (name, damaged) in [
            ("broken startxref", damage_startxref(&good)),
            ("no xref table", damage_no_xref(&good)),
            ("junk before the header", damage_junk_prefix(&good)),
            ("shifted object offsets", damage_shifted_offsets(&good)),
        ] {
            let repaired = super::rebuild_pdf(&damaged)
                .unwrap_or_else(|e| panic!("{name}: expected a repair, got: {e}"));
            assert_eq!(
                page_count(&repaired),
                original,
                "{name}: every page should come back, not just the first"
            );
        }
    }

    #[test]
    fn repair_02_says_so_when_too_little_of_the_file_survives() {
        let good = sample_pdf();
        // Cut mid-object: the commonest real damage, and the one case qpdf
        // cannot rebuild. Failing here is the correct answer — the content is
        // genuinely not in the file any more.
        let truncated = good[..good.len() * 6 / 10].to_vec();

        let err = super::rebuild_pdf(&truncated).expect_err("a truncated file cannot be rebuilt");
        // The message has to be useful, not just present: it names the problem
        // and the only thing the user can actually do about it.
        assert!(
            err.contains("damaged too badly"),
            "message should say the file cannot be rebuilt, got: {err}"
        );
        assert!(
            err.contains("another copy"),
            "message should tell the user what to do, got: {err}"
        );
    }

    #[test]
    fn repair_03_leaves_an_undamaged_document_intact() {
        let good = sample_pdf();
        let out = super::rebuild_pdf(&good).expect("an intact file repairs to itself");
        assert_eq!(page_count(&out), 3, "repair must not drop pages it was given");
    }

    // ─── format_gs_crash_error — user-friendly GS error messages ──────────────

    // ─── format_word_automation_error — friendly Word AppleScript error messages ──

    /// [CR-BUG-04] -2753 "variable is not defined" (the raw error Word conversions
    /// surfaced to the user) must produce the friendly automation-broken message,
    /// not the cryptic AppleScript line/column text.
    #[test]
    fn word_automation_error_detects_undefined_variable() {
        let stderr = "386:392: execution error: The variable theDoc is not defined. (-2753)";
        let msg = super::format_word_automation_error(stderr);
        assert!(msg.contains("automation"), "should explain it's an automation issue");
        assert!(msg.contains("LibreOffice"), "should suggest LibreOffice as an alternative");
        assert!(!msg.contains("386:392"), "should not leak the raw AppleScript line:column");
    }

    #[test]
    fn word_automation_error_detects_doesnt_understand() {
        let stderr = "68:244: execution error: Microsoft Word got an error: document \"x.docx\" doesn\u{2019}t understand the \u{201c}save as\u{201d} message. (-1708)";
        let msg = super::format_word_automation_error(stderr);
        assert!(msg.contains("automation"), "should explain it's an automation issue");
        assert!(msg.contains("LibreOffice"), "should suggest LibreOffice as an alternative");
    }

    #[test]
    fn word_automation_error_generic_fallback() {
        let stderr = "some other AppleScript failure";
        let msg = super::format_word_automation_error(stderr);
        assert!(msg.contains(stderr), "unrecognized errors should still include raw stderr");
        assert!(!msg.contains("automation isn't responding"), "should not claim automation is broken for unrelated errors");
    }

    #[test]
    fn word_automation_error_empty_stderr() {
        let msg = super::format_word_automation_error("");
        assert!(msg.contains("no error output"));
    }


    // ─── IM-FIX-01 — Image processing with real committed fixtures ──────────
    //
    // These tests read actual binary fixture files and exercise encode_image
    // to catch regressions in format conversion, quality encoding, and resize.
    // They run in all CI environments (no GS dependency).

    mod fixture_integration {
        use super::*;
        use std::io::Read;

        fn fixture_path(name: &str) -> std::path::PathBuf {
            std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                .parent()
                .expect("workspace root")
                .join("test-fixtures")
                .join(name)
        }

        pub(super) fn read_fixture(name: &str) -> Vec<u8> {
            let mut file = std::fs::File::open(fixture_path(name))
                .expect(&format!("fixture {} must exist", name));
            let mut bytes = Vec::new();
            file.read_to_end(&mut bytes)
                .expect(&format!("failed to read fixture {}", name));
            bytes
        }

        fn has_jpeg_magic(bytes: &[u8]) -> bool {
            bytes.len() >= 2 && bytes[0] == 0xFF && bytes[1] == 0xD8
        }

        fn has_png_magic(bytes: &[u8]) -> bool {
            bytes.len() >= 4 && bytes[0..4] == [0x89, 0x50, 0x4E, 0x47]
        }

        fn has_webp_magic(bytes: &[u8]) -> bool {
            bytes.len() >= 12
                && bytes[0..4] == [0x52, 0x49, 0x46, 0x46]
                && bytes[8..12] == [0x57, 0x45, 0x42, 0x50]
        }

        #[test]
        fn compressing_a_photograph_never_returns_a_bigger_file() {
            // The app exists to make a file fit an upload limit. Handing back
            // something larger is not a degraded result, it is the opposite of
            // the product.
            //
            // Found during BAT-06 and reproducible byte for byte: this fixture
            // is 4:2:0 progressive at 2,385,146 bytes, and re-encoding it at
            // quality 60 produced 2,563,428 -- 7.5% larger, while also throwing
            // away luma detail. image-0.25's JPEG encoder hardcodes h:1 v:1 for
            // every component, so it always writes 4:4:4 and stores four times
            // the chroma the source had. Its own doc comment claims 4:2:2; the
            // code says otherwise.
            let src = read_fixture("pexels-pixabay-459225.jpg");
            let out = encode_image(&src, 60, "jpeg", None, None, false)
                .expect("the fixture must encode");

            assert!(
                out.len() <= src.len(),
                "compression returned a LARGER file: {} -> {} ({:+.1}%)",
                src.len(),
                out.len(),
                (out.len() as f64 / src.len() as f64 - 1.0) * 100.0
            );
        }

        #[test]
        fn jpeg_quality_50_roundtrip() {
            let src = read_fixture("pexels-pixabay-459225.jpg");
            let result = encode_image(&src, 50, "jpeg", None, None, false);
            assert!(result.is_ok(), "50% JPEG quality encode must succeed");
            let out = result.unwrap();
            assert!(out.len() > 0, "output must not be empty");
            assert!(has_jpeg_magic(&out), "output must have JPEG magic bytes (FF D8)");
        }

        #[test]
        fn jpeg_to_png_conversion() {
            let src = read_fixture("sample.jpg");
            let result = encode_image(&src, 80, "png", None, None, false);
            assert!(result.is_ok(), "JPEG to PNG conversion must succeed");
            let out = result.unwrap();
            assert!(has_png_magic(&out), "output must have PNG magic (89 50 4E 47)");
        }

        #[test]
        fn jpeg_to_webp_conversion() {
            let src = read_fixture("sample.jpg");
            let result = encode_image(&src, 80, "webp", None, None, false);
            assert!(result.is_ok(), "JPEG to WebP conversion must succeed");
            let out = result.unwrap();
            assert!(has_webp_magic(&out), "output must have WebP magic (RIFF...WEBP)");
        }

        #[test]
        fn bmp_decode_and_reencode() {
            let src = read_fixture("sample.bmp");
            let result = encode_image(&src, 80, "jpeg", None, None, false);
            assert!(result.is_ok(), "BMP to JPEG decode must succeed");
            let out = result.unwrap();
            assert!(has_jpeg_magic(&out), "output must be valid JPEG");
        }

        // TIFF support note: the `image` crate requires the 'tiff' feature which may not be enabled.
        // Skipping TIFF test — BMP and GIF are sufficient for format coverage.
        // Real-world users rarely upload TIFF files to a web app.

        #[test]
        fn gif_decode_and_reencode() {
            let src = read_fixture("sample.gif");
            let result = encode_image(&src, 80, "png", None, None, false);
            assert!(result.is_ok(), "GIF to PNG decode must succeed");
            let out = result.unwrap();
            assert!(has_png_magic(&out), "output must be valid PNG");
        }

        #[test]
        fn jpeg_resize_exact_800x600() {
            let src = read_fixture("pexels-pixabay-459225.jpg");
            let result = encode_image(&src, 80, "jpeg", Some(800), Some(600), false);
            assert!(result.is_ok(), "resize to 800x600 must succeed");
            let out = result.unwrap();
            assert!(has_jpeg_magic(&out), "output must be valid JPEG");
            assert!(out.len() > 0, "output must not be empty");
        }

        #[test]
        fn jpeg_resize_aspect_preserving() {
            let src = read_fixture("pexels-pixabay-459225.jpg");
            let result = encode_image(&src, 80, "jpeg", Some(400), Some(400), true);
            assert!(result.is_ok(), "fit to 400x400 box must succeed");
            let out = result.unwrap();
            assert!(has_jpeg_magic(&out), "output must be valid JPEG");
            assert!(out.len() > 0, "output must not be empty");
        }
    }


    // ─── IMG-HEIC-01 — HEIC input, the iPhone photo path ────────────────────────
    //
    // Decoding runs on macOS Image I/O (see heic.rs), so the tests that actually
    // decode a HEIC are gated to macOS and DO NOT run on the ubuntu CI runner.
    // What runs everywhere: brand sniffing, the non-HEIC path, and the honest
    // error produced on platforms that have no decoder.

    mod heic_input {
        use super::super::{decode_input_image, encode_image, heic};
        use heic::{frame_count, is_heic};
        use super::fixture_integration::read_fixture;

        #[test]
        fn heic_fixtures_are_recognised_by_their_ftyp_brand() {
            assert!(is_heic(&read_fixture("sample.heic")));
            assert!(is_heic(&read_fixture("sample-multi.heic")));
        }

        #[test]
        fn ordinary_images_are_not_mistaken_for_heic() {
            assert!(!is_heic(&read_fixture("sample.jpg")));
            assert!(!is_heic(&read_fixture("sample.png")));
        }

        #[test]
        fn a_truncated_header_does_not_panic_the_sniffer() {
            assert!(!is_heic(&[]));
            assert!(!is_heic(b"\0\0\0"));
            assert!(!is_heic(b"\0\0\0\x18ftyp"));
        }

        #[test]
        fn non_heic_input_still_decodes_on_every_platform() {
            let img = decode_input_image(&read_fixture("sample.jpg"))
                .expect("JPEG must still decode through the new entry point");
            assert_eq!((img.width(), img.height()), (300, 200));
        }

        #[cfg(target_os = "macos")]
        #[test]
        fn heic_decodes_to_its_real_dimensions() {
            let img = decode_input_image(&read_fixture("sample.heic"))
                .expect("sample.heic must decode");
            assert_eq!((img.width(), img.height()), (300, 200));
        }

        #[cfg(target_os = "macos")]
        #[test]
        fn a_multi_image_heic_uses_the_primary_image() {
            // sample-multi.heic holds two frames: primary 120x80, secondary 60x40.
            // Taking the primary is the defensible behaviour; silently taking
            // whichever frame happens to be last is what this pins against.
            let img = decode_input_image(&read_fixture("sample-multi.heic"))
                .expect("multi-image heic must decode");
            assert_eq!((img.width(), img.height()), (120, 80));
        }

        #[cfg(target_os = "macos")]
        #[test]
        fn decoded_pixels_keep_their_real_colours() {
            // sample-multi.heic's primary frame is solid red (220, 40, 40).
            // Pins the channel order coming out of Core Graphics: an alpha-First
            // bitmap format yields ARGB instead of RGBA, which shifts every
            // channel by one. Dimensions still pass, and every photo comes out
            // looking wrong. Verified to fail under that mutation.
            let img = decode_input_image(&read_fixture("sample-multi.heic"))
                .expect("multi-image heic must decode");
            let px = img.to_rgba8().get_pixel(60, 40).0;
            assert!(px[0] > 200, "red channel must be red, got {:?}", px);
            assert!(px[2] < 80, "blue channel must be blue, got {:?}", px);
            assert_eq!(px[3], 255, "an opaque photo must stay opaque");
        }

        // ─── HEIC-07/08 — an iPhone photo taken in portrait ───────────────────
        //
        // Every iPhone stores its photos in one sensor orientation and records
        // the upright rotation as EXIF metadata. Preview and Finder apply it;
        // CGImageSourceCreateImageAtIndex does not, and neither did we — so the
        // persona's very first action, photographing an ID in portrait and
        // dragging it in, produced a document lying on its side.
        //
        // Confirmed against a real iPhone 13 mini capture during the release
        // gate: exifOrientation=6, decoded 4032x3024 instead of 3024x4032.
        // Nothing caught it because both existing fixtures are orientation 1.

        // The companion to ocr_a_real_path: decodes a photo from outside the
        // fixtures, so a real capture can be checked without guessing.
        //   PAPERCUT_HEIC_PATH=~/Downloads/IMG_0001.HEIC \
        //     cargo test --lib heic_a_real_path -- --ignored --nocapture
        #[cfg(target_os = "macos")]
        #[test]
        #[ignore]
        fn heic_a_real_path() {
            let path = std::env::var("PAPERCUT_HEIC_PATH").expect("PAPERCUT_HEIC_PATH");
            let bytes = std::fs::read(&path).expect("read");
            let frames = frame_count(&bytes).expect("frame count");
            let img = decode_input_image(&bytes).expect("decode");
            eprintln!("--- {path}: frames={frames} decoded={}x{}", img.width(), img.height());
        }

        #[cfg(target_os = "macos")]
        #[test]
        fn a_photo_taken_in_portrait_decodes_upright() {
            // rotated.heic is stored 120x80 with orientation 6 ("rotate 90° CW
            // to display"), so an honest decoder must return 80x120.
            let img = decode_input_image(&read_fixture("rotated.heic"))
                .expect("rotated.heic must decode");
            assert_eq!(
                (img.width(), img.height()),
                (80, 120),
                "a portrait photo must not come out on its side"
            );
        }

        #[cfg(target_os = "macos")]
        #[test]
        fn the_rotation_turns_the_right_way() {
            // Size alone cannot tell 90° clockwise from 90° anticlockwise — both
            // give 80x120, and one of them puts the document upside down.
            // The marker sits in the stored top-left, which a correct clockwise
            // turn moves to the displayed top-right.
            let img = decode_input_image(&read_fixture("rotated.heic"))
                .expect("rotated.heic must decode");
            let rgba = img.to_rgba8();
            let (w, _h) = (rgba.width(), rgba.height());

            let top_right = rgba.get_pixel(w - 6, 5).0;
            assert!(
                top_right[2] > 200 && top_right[0] < 80,
                "the marker must land top-right after a clockwise turn, got {top_right:?}"
            );

            let top_left = rgba.get_pixel(5, 5).0;
            assert!(
                top_left[0] > 200 && top_left[2] > 200,
                "the top-left must be the white field once the marker has moved, got {top_left:?}"
            );
        }

        #[cfg(target_os = "macos")]
        #[test]
        fn frame_count_reports_every_frame_so_the_user_can_be_told() {
            assert_eq!(frame_count(&read_fixture("sample.heic")).unwrap(), 1);
            assert_eq!(frame_count(&read_fixture("sample-multi.heic")).unwrap(), 2);
        }

        #[cfg(target_os = "macos")]
        #[test]
        fn an_iphone_photo_converts_to_jpeg() {
            let out = encode_image(&read_fixture("sample.heic"), 85, "jpeg", None, None, false)
                .expect("HEIC -> JPEG must succeed");
            assert!(out.len() > 2 && out[0] == 0xFF && out[1] == 0xD8, "output must be JPEG");
        }

        #[cfg(target_os = "macos")]
        #[test]
        fn an_iphone_photo_converts_to_png_and_webp() {
            let heic = read_fixture("sample.heic");
            let png = encode_image(&heic, 85, "png", None, None, false).expect("HEIC -> PNG");
            assert_eq!(&png[..4], b"\x89PNG", "output must be PNG");
            let webp = encode_image(&heic, 85, "webp", None, None, false).expect("HEIC -> WebP");
            assert_eq!(&webp[..4], b"RIFF", "output must be WebP");
        }

        #[cfg(target_os = "macos")]
        #[test]
        fn an_iphone_photo_resizes_like_any_other_image() {
            let out = encode_image(&read_fixture("sample.heic"), 85, "jpeg", Some(150), Some(100), false)
                .expect("HEIC resize must succeed");
            let decoded = image::load_from_memory(&out).expect("resized output must decode");
            assert_eq!((decoded.width(), decoded.height()), (150, 100));
        }

        #[cfg(not(target_os = "macos"))]
        #[test]
        fn platforms_without_a_decoder_say_so_plainly() {
            let err = decode_input_image(&read_fixture("sample.heic"))
                .expect_err("HEIC must not decode off macOS");
            assert!(err.contains("macOS"), "error must name the platform limit, got: {err}");
        }
    }



    // ─── OCR-01 — Text recognition on a scanned PDF ────────────────────────────
    //
    // Runs on Apple Vision (see ocr.rs), so the tests that actually recognise
    // text are macOS-gated and DO NOT run on the ubuntu CI runner — the same
    // arrangement as the HEIC decode tests. What runs everywhere is the honest
    // error on a platform with no engine.
    //
    // test-fixtures/scanned.pdf is a genuinely image-only PDF: two A4 pages,
    // each a rasterised image of known text with no text layer at all. The known
    // wording is what lets these assert on the result rather than merely on the
    // fact that something came back.

    mod ocr_recognition {
        use super::super::ocr;
        use super::fixture_integration::read_fixture;

        fn fixture_path(name: &str) -> String {
            std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                .parent().expect("workspace root")
                .join("test-fixtures").join(name)
                .to_string_lossy().to_string()
        }

        #[test]
        fn the_fixture_really_is_image_only() {
            // If this ever gains a text layer the OCR tests below become
            // meaningless without failing — they would be reading the layer.
            let bytes = read_fixture("scanned.pdf");
            let raw = String::from_utf8_lossy(&bytes);
            assert!(!raw.contains("MUSTERMANN"), "fixture must not carry a text layer");
        }

        #[cfg(target_os = "macos")]
        #[test]
        fn a_scanned_page_yields_the_text_that_is_on_it() {
            let pages = ocr::recognize_pdf(&fixture_path("scanned.pdf"), &["en-US".to_string()], |_, _| {})
                .expect("scanned.pdf must be recognised");
            assert_eq!(pages.len(), 2, "both pages must be read");

            let page_one: String = pages[0].blocks.iter().map(|b| b.text.as_str())
                .collect::<Vec<_>>().join(" ");
            assert!(page_one.contains("MUSTERMANN"), "got: {page_one}");
            assert!(page_one.contains("RESIDENCE PERMIT"), "got: {page_one}");

            let page_two: String = pages[1].blocks.iter().map(|b| b.text.as_str())
                .collect::<Vec<_>>().join(" ");
            assert!(page_two.contains("BERLIN"), "got: {page_two}");
        }

        #[cfg(target_os = "macos")]
        #[test]
        fn text_is_positioned_inside_the_page_it_came_from() {
            // The acceptance criterion is that the text layer aligns with the
            // page. Boxes outside the page mean the layer lands nowhere useful,
            // and a coordinate flip would put every line on the wrong half.
            let pages = ocr::recognize_pdf(&fixture_path("scanned.pdf"), &["en-US".to_string()], |_, _| {})
                .expect("must recognise");
            let page = &pages[0];
            assert!((page.width - 595.0).abs() < 2.0, "A4 width in points, got {}", page.width);
            assert!((page.height - 842.0).abs() < 2.0, "A4 height in points, got {}", page.height);

            for block in &page.blocks {
                assert!(block.x >= 0.0 && block.x + block.width <= page.width + 1.0,
                        "{:?} runs off the page horizontally", block);
                assert!(block.y >= 0.0 && block.y + block.height <= page.height + 1.0,
                        "{:?} runs off the page vertically", block);
            }
        }

        #[cfg(target_os = "macos")]
        #[test]
        fn the_heading_sits_above_the_body_text() {
            // Pins the vertical origin. Vision and PDF both put y=0 at the
            // bottom; if that were flipped the page would still "look fine" in
            // every box-bounds check above while reading upside down.
            let pages = ocr::recognize_pdf(&fixture_path("scanned.pdf"), &["en-US".to_string()], |_, _| {})
                .expect("must recognise");
            let find = |needle: &str| pages[0].blocks.iter()
                .find(|b| b.text.contains(needle))
                .unwrap_or_else(|| panic!("missing {needle}"))
                .y;
            assert!(find("RESIDENCE") > find("Nationality"),
                    "the title must sit higher up the page than the last line");
        }

        #[cfg(target_os = "macos")]
        #[test]
        fn every_page_is_reported_before_it_is_worked_on() {
            let mut seen = Vec::new();
            ocr::recognize_pdf(&fixture_path("scanned.pdf"), &["en-US".to_string()],
                               |i, total| seen.push((i, total)))
                .expect("must recognise");
            assert_eq!(seen, vec![(0, 2), (1, 2)]);
        }

        #[cfg(target_os = "macos")]
        #[test]
        fn clean_print_comes_back_confident() {
            // The flip side of reporting confidence: on a clean render it must
            // actually be high, or a low-confidence warning would fire always.
            let pages = ocr::recognize_pdf(&fixture_path("scanned.pdf"), &["en-US".to_string()], |_, _| {})
                .expect("must recognise");
            let worst = pages[0].blocks.iter().map(|b| b.confidence).fold(1.0f32, f32::min);
            assert!(worst > 0.5, "clean text should not read as uncertain, got {worst}");
        }

        #[cfg(target_os = "macos")]
        #[test]
        fn a_file_that_is_not_a_pdf_fails_clearly() {
            let err = ocr::recognize_pdf(&fixture_path("sample.jpg"), &[], |_, _| {})
                .expect_err("a JPEG is not a PDF");
            assert!(err.contains("could not be opened"), "got: {err}");
        }

        // ─── OCR-09..11 — the reason a file failed, not just that it did ───────
        //
        // PDFKit reports every failure as a nil document, so `recognize_pdf`
        // said "This PDF could not be opened." whether the file was missing,
        // unreadable, or genuinely corrupt. That is not a cosmetic problem: the
        // one message it produces sends the user to the Repair PDF tool, which
        // cannot help with any of the other causes.
        //
        // Found while diagnosing REL-03. A readable, structurally valid PDF on
        // an iCloud-synced Desktop failed to open while the machine was offline,
        // and the app blamed the document.

        // A gate tool, not a test: runs the real recognition path against a file
        // outside the fixtures, so an app-layer failure can be told apart from an
        // engine failure without guessing. Written during REL-03, where the app
        // blamed a document that the engine reads perfectly.
        //
        // It is also how the low-confidence path gets exercised: the committed
        // fixtures are clean synthetic renders at ~1.00, and only a real skewed
        // phone photo produces anything else.
        //
        //   PAPERCUT_OCR_PATH=/path/to.pdf cargo test --lib ocr_a_real_path -- --ignored --nocapture
        #[cfg(target_os = "macos")]
        #[test]
        #[ignore]
        fn ocr_a_real_path() {
            let path = std::env::var("PAPERCUT_OCR_PATH").expect("PAPERCUT_OCR_PATH");
            eprintln!("--- recognize_pdf({path})");
            match ocr::recognize_pdf(&path, &["en-US".to_string()], |i, t| eprintln!("    page {i}/{t}")) {
                Ok(pages) => {
                    let words: usize = pages.iter().map(|p| p.blocks.len()).sum();
                    eprintln!("--- OK pages={} blocks={}", pages.len(), words);
                    for p in &pages {
                        for b in p.blocks.iter().take(3) {
                            eprintln!("    p{} conf={:.2} {:?}", p.index, b.confidence, b.text);
                        }
                    }
                }
                Err(e) => eprintln!("--- ERR {e}"),
            }
        }

        #[cfg(target_os = "macos")]
        #[test]
        fn a_missing_file_says_so_rather_than_blaming_the_pdf() {
            let err = ocr::recognize_pdf("/nonexistent/papercut-no-such-file.pdf", &[], |_, _| {})
                .expect_err("a missing file cannot be recognised");
            assert!(
                err.contains("could not be found"),
                "a missing file must not be reported as an unopenable PDF; got: {err}"
            );
        }

        #[cfg(target_os = "macos")]
        #[test]
        fn an_unreadable_file_names_the_permission_rather_than_blaming_the_pdf() {
            use std::os::unix::fs::PermissionsExt;

            // A real PDF the process genuinely cannot read: the exact shape of
            // the REL-03 failure, minus the cloud daemon.
            let dir = std::env::temp_dir().join("papercut-ocr-perm");
            std::fs::create_dir_all(&dir).expect("temp dir");
            let path = dir.join("unreadable.pdf");
            std::fs::copy(fixture_path("scanned.pdf"), &path).expect("copy fixture");
            std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o000))
                .expect("drop read permission");

            let err = ocr::recognize_pdf(path.to_str().unwrap(), &[], |_, _| {})
                .expect_err("an unreadable file cannot be recognised");

            // Restore before asserting so a failure cannot leave the file locked.
            let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o644));
            let _ = std::fs::remove_file(&path);

            assert!(
                err.to_lowercase().contains("not allowed") || err.to_lowercase().contains("permission"),
                "a permission failure must name the permission; got: {err}"
            );
        }

        #[cfg(target_os = "macos")]
        #[test]
        fn writing_a_searchable_pdf_reports_a_missing_source_honestly() {
            // build_searchable_pdf carries the same conflation at ocr.rs:191.
            let err = ocr::build_searchable_pdf("/nonexistent/papercut-no-such-file.pdf", &[])
                .expect_err("a missing source cannot be written");
            assert!(
                err.contains("could not be found"),
                "got: {err}"
            );
        }


        #[cfg(target_os = "macos")]
        #[test]
        fn the_output_pdf_is_actually_searchable() {
            // The whole point of OCR, and the one claim worth proving end to end:
            // recognise a page that has no text, write the layer, then read the
            // text back out of the result with a different API than wrote it.
            use std::io::Write;

            let src = fixture_path("scanned.pdf");
            let pages = ocr::recognize_pdf(&src, &["en-US".to_string()], |_, _| {})
                .expect("must recognise");
            let bytes = ocr::build_searchable_pdf(&src, &pages)
                .expect("must build a searchable PDF");
            assert!(bytes.starts_with(b"%PDF-"), "output must be a PDF");

            let out = std::env::temp_dir().join("papercut-ocr-searchable.pdf");
            std::fs::File::create(&out).unwrap().write_all(&bytes).unwrap();

            let extracted = ocr::extract_text(out.to_str().unwrap())
                .expect("must read the result back");
            assert!(extracted.contains("MUSTERMANN"), "extracted: {extracted}");
            assert!(extracted.contains("BERLIN"), "extracted: {extracted}");

            let _ = std::fs::remove_file(&out);
        }

        #[cfg(target_os = "macos")]
        #[test]
        fn the_source_pdf_still_has_no_text_of_its_own() {
            // Pins that the assertion above is really testing the layer we wrote.
            // If the fixture ever gained a text layer, that test would pass while
            // build_searchable_pdf did nothing at all.
            let extracted = ocr::extract_text(&fixture_path("scanned.pdf"))
                .expect("must open the fixture");
            assert!(
                !extracted.contains("MUSTERMANN"),
                "the source must have no text layer, got: {extracted}"
            );
        }


        #[cfg(target_os = "macos")]
        #[test]
        fn a_text_layer_survives_beyond_latin_1() {
            // pdf-lib's standard fonts are WinAnsi and throw on "Ş", which is why
            // the layer is written with Core Text instead: system fonts cover
            // every language Vision can read, substituting per glyph. Turkish and
            // German are what F13b targets; Greek and Japanese are here to pin
            // that the fallback is real rather than a wider single font.
            use std::io::Write;

            let phrases = [
                "Şişli Güngören İstanbul",   // Turkish
                "Müller Straße Köln",         // German
                "Ελληνικά κείμενο",           // Greek
                "日本語のテキスト",              // Japanese
            ];
            let blocks: Vec<_> = phrases.iter().enumerate().map(|(i, text)| ocr::OcrBlock {
                text: (*text).to_string(),
                x: 50.0,
                y: 700.0 - (i as f64 * 60.0),
                width: 300.0,
                height: 20.0,
                confidence: 1.0,
            }).collect();
            let page = ocr::OcrPage { index: 0, width: 595.0, height: 842.0, blocks };

            let bytes = ocr::build_searchable_pdf(&fixture_path("scanned.pdf"), &[page])
                .expect("must build");
            let out = std::env::temp_dir().join("papercut-ocr-unicode.pdf");
            std::fs::File::create(&out).unwrap().write_all(&bytes).unwrap();

            let extracted = ocr::extract_text(out.to_str().unwrap()).expect("must read back");
            for phrase in phrases {
                assert!(extracted.contains(phrase), "{phrase:?} did not survive: {extracted}");
            }
            let _ = std::fs::remove_file(&out);
        }


        /// Prints real OCR output as JSON, for use as a TypeScript test fixture.
        /// Ignored by default; run with:
        ///   cargo test --lib dump_real_ocr_output -- --ignored --nocapture
        ///
        /// The TS search tests must be driven by what the engine actually emits,
        /// not by what it is assumed to emit. A previous search fix in this repo
        /// shipped broken for exactly that reason.
        #[cfg(target_os = "macos")]
        #[test]
        #[ignore]
        fn dump_real_ocr_output() {
            let pages = ocr::recognize_pdf(&fixture_path("scanned.pdf"), &["en-US".to_string()], |_, _| {})
                .expect("must recognise");
            println!("{}", serde_json::to_string_pretty(&pages).unwrap());
        }

        #[cfg(not(target_os = "macos"))]
        #[test]
        fn platforms_without_an_engine_say_so_plainly() {
            let err = ocr::recognize_pdf(&fixture_path("scanned.pdf"), &[], |_, _| {})
                .expect_err("must not recognise off macOS");
            assert!(err.contains("macOS"), "got: {err}");
        }
    }

    // ─── DEP-02 — Ghostscript availability must mean "it works" ────────────────
    //
    // is_ghostscript_available returned true whenever a sidecar *command object*
    // could be constructed, which it always can — the file's existence is never
    // checked, let alone whether it runs. Three of the four bundled sidecars are
    // stub scripts that print "gs not bundled on this platform" and exit 1, so
    // the app reported Ghostscript available on every platform and the disabled
    // state with its install hint never appeared.

    // ─── PDF-GS-INT-01 — Ghostscript integration (conditional on GS availability) ─
    //
    // These tests invoke the actual gs subprocess directly to verify GS
    // compression behavior. They are silently skipped if GS is not installed
    // (for CI jobs that don't have GS, only for PR validation).

    mod ghostscript_integration {
        use std::process::Command;

        fn fixture_path(name: &str) -> std::path::PathBuf {
            std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                .parent()
                .expect("workspace root")
                .join("test-fixtures")
                .join(name)
        }

        fn has_pdf_magic(bytes: &[u8]) -> bool {
            bytes.len() >= 4 && &bytes[0..4] == b"%PDF"
        }

    }

    // ─── Save must never leave a half-written file over the original ──────────

    /// [SAVE-ATOMIC] Fixtures for the four file-permission paths (FP-01 – FP-04).
    ///
    /// Since Save writes back over the file it was given, every one of these
    /// runs against the user's only copy. The failure that matters is not a bad
    /// error message, it is a 30 MB scan replaced by 4 KB of a 30 MB scan.
    #[cfg(test)]
    mod atomic_save {
        use crate::atomic_replace;
        use std::fs;
        use std::path::PathBuf;

        fn scratch(name: &str) -> PathBuf {
            let dir = std::env::temp_dir().join(format!("papercut_atomic_{}_{}", name, std::process::id()));
            let _ = fs::remove_dir_all(&dir);
            fs::create_dir_all(&dir).expect("scratch dir");
            dir
        }

        #[cfg(unix)]
        fn chmod(path: &std::path::Path, mode: u32) {
            use std::os::unix::fs::PermissionsExt;
            let mut p = fs::metadata(path).expect("metadata").permissions();
            p.set_mode(mode);
            fs::set_permissions(path, p).expect("set_permissions");
        }

        /// [FP-01] A read-only source is refused, and refused by name.
        ///
        /// The direct write this replaces got this right by accident: open(2)
        /// with O_TRUNC fails on a 0444 file before it can truncate anything.
        /// An atomic replace does NOT inherit that safety -- rename(2) needs
        /// write permission on the *directory*, not on the file -- so without
        /// an explicit pre-flight the fix for FP-02 would silently overwrite a
        /// file the user had deliberately marked read-only.
        #[test]
        #[cfg(unix)]
        fn a_read_only_file_is_refused_and_left_intact() {
            let dir = scratch("readonly");
            let target = dir.join("ro.pdf");
            fs::write(&target, b"ORIGINAL").expect("write");
            chmod(&target, 0o444);

            let err = atomic_replace(&target, &vec![b'X'; 4096]).expect_err("must refuse");

            assert!(
                err.starts_with("READ_ONLY:"),
                "a read-only target must be named as such, got: {err}"
            );
            assert_eq!(
                fs::read(&target).expect("read"),
                b"ORIGINAL",
                "the original must be byte-for-byte untouched"
            );
            chmod(&target, 0o644);
            let _ = fs::remove_dir_all(&dir);
        }

        /// [FP-04] The same file saves once the permission is restored.
        #[test]
        #[cfg(unix)]
        fn the_retry_after_chmod_succeeds() {
            let dir = scratch("retry");
            let target = dir.join("ro.pdf");
            fs::write(&target, b"ORIGINAL").expect("write");
            chmod(&target, 0o444);
            atomic_replace(&target, b"NEW").expect_err("must refuse while read-only");

            chmod(&target, 0o644);
            atomic_replace(&target, b"NEW").expect("must write once writable");

            assert_eq!(fs::read(&target).expect("read"), b"NEW");
            let _ = fs::remove_dir_all(&dir);
        }

        /// [FP-02] A source deleted while the tool was open is not silently
        /// recreated by the backend -- it is reported as gone, so the interface
        /// can offer Save as... rather than resurrecting a file at a path the
        /// user removed on purpose.
        #[test]
        fn a_vanished_target_is_reported_not_recreated() {
            let dir = scratch("vanished");
            let target = dir.join("gone.pdf");
            fs::write(&target, b"ORIGINAL").expect("write");
            fs::remove_file(&target).expect("remove");

            let err = atomic_replace(&target, b"NEW").expect_err("must refuse");

            assert!(
                err.starts_with("TARGET_GONE:"),
                "a missing target must be named as such, got: {err}"
            );
            assert!(!target.exists(), "the file the user deleted must stay deleted");
            let _ = fs::remove_dir_all(&dir);
        }

        /// [FP-03] Renaming is the same fact as deleting, from the old path's
        /// point of view -- and worse to get wrong: recreating the old name
        /// leaves the user holding two files and looking at an undone rename.
        #[test]
        fn a_renamed_target_leaves_both_paths_alone() {
            let dir = scratch("renamed");
            let from = dir.join("before.pdf");
            let to = dir.join("after.pdf");
            fs::write(&from, b"ORIGINAL").expect("write");
            fs::rename(&from, &to).expect("rename");

            let err = atomic_replace(&from, b"NEW").expect_err("must refuse");

            assert!(err.starts_with("TARGET_GONE:"), "got: {err}");
            assert!(!from.exists(), "the old name must not come back");
            assert_eq!(
                fs::read(&to).expect("read"),
                b"ORIGINAL",
                "the file the user renamed to must be untouched"
            );
            let _ = fs::remove_dir_all(&dir);
        }

        /// The containing directory being gone is a different fault from the
        /// file being gone, and from a permission problem. All three used to
        /// reach the user as "check that you have permission".
        #[test]
        fn a_missing_directory_is_its_own_fault() {
            let dir = scratch("nodir");
            let sub = dir.join("sub");
            fs::create_dir_all(&sub).expect("mkdir");
            let target = sub.join("f.pdf");
            fs::write(&target, b"ORIGINAL").expect("write");
            fs::remove_dir_all(&sub).expect("rmdir");

            let err = atomic_replace(&target, b"NEW").expect_err("must refuse");

            assert!(err.starts_with("NO_DIR:"), "got: {err}");
            let _ = fs::remove_dir_all(&dir);
        }

        /// The point of the whole exercise: the original is never the file
        /// being written to, so no failure can leave it half-written.
        ///
        /// Measured before the fix: open(O_TRUNC) on a 50,000-byte file leaves
        /// it at 0 bytes before a single byte of the replacement is written.
        /// Every byte written after that point is a race against the original.
        #[test]
        fn the_original_is_never_the_file_being_written() {
            let dir = scratch("neverdirect");
            let target = dir.join("big.pdf");
            fs::write(&target, vec![b'A'; 50_000]).expect("write");

            // A replacement large enough that a direct write would be partial
            // for a long time, and a directory watched for what appears in it.
            let payload = vec![b'B'; 200_000];
            atomic_replace(&target, &payload).expect("must write");

            assert_eq!(fs::read(&target).expect("read"), payload);
            let leftovers: Vec<_> = fs::read_dir(&dir)
                .expect("read_dir")
                .flatten()
                .map(|e| e.file_name().to_string_lossy().to_string())
                .filter(|n| n != "big.pdf")
                .collect();
            assert!(
                leftovers.is_empty(),
                "the temporary file must not survive a successful save: {leftovers:?}"
            );
            let _ = fs::remove_dir_all(&dir);
        }

        /// A saved file keeps the mode it had. Writing through a temporary file
        /// creates a fresh inode, so without this the user's own permissions
        /// are quietly replaced by whatever the process umask says.
        #[test]
        #[cfg(unix)]
        fn the_replacement_keeps_the_original_permissions() {
            use std::os::unix::fs::PermissionsExt;
            let dir = scratch("mode");
            let target = dir.join("f.pdf");
            fs::write(&target, b"ORIGINAL").expect("write");
            chmod(&target, 0o600);

            atomic_replace(&target, b"NEW").expect("must write");

            let mode = fs::metadata(&target).expect("metadata").permissions().mode() & 0o777;
            assert_eq!(mode, 0o600, "the file's own permissions must survive the save");
            let _ = fs::remove_dir_all(&dir);
        }

        /// A path only reaches the backend if it survives the trip through an
        /// ASCII IPC header. Turkish and German filenames are the ordinary case
        /// for this app's users, not an edge one.
        #[test]
        fn a_non_ascii_path_survives_the_header() {
            use crate::percent_decode_utf8;
            assert_eq!(
                percent_decode_utf8(b"/Users/a/%C3%96deme%20Plan%C4%B1.pdf").as_deref(),
                Some("/Users/a/Ödeme Planı.pdf")
            );
            assert_eq!(
                percent_decode_utf8(b"/plain/report.pdf").as_deref(),
                Some("/plain/report.pdf")
            );
            // Truncated and non-hex escapes must decline, not panic.
            assert_eq!(percent_decode_utf8(b"/a/%C3"), None);
            assert_eq!(percent_decode_utf8(b"/a/%ZZ"), None);
        }

        /// The scope boundary `writeFile` used to apply, put back by hand.
        ///
        /// `save_over_file` is a first-party command and so bypasses
        /// `tauri-plugin-fs`'s scope check, while performing the single most
        /// destructive write in the app. Without this it would write anywhere
        /// the OS allows.
        #[test]
        fn a_target_outside_every_root_is_refused() {
            use crate::is_writable_target;
            let dir = scratch("scope");
            let root = dir.join("documents");
            fs::create_dir_all(&root).expect("mkdir");
            let outside = dir.join("elsewhere");
            fs::create_dir_all(&outside).expect("mkdir");
            let roots = vec![root.clone()];

            assert!(
                is_writable_target(&root.join("a.pdf"), &roots, false),
                "a file inside a declared root must be writable"
            );
            assert!(
                is_writable_target(&root.join("sub").join("a.pdf"), &roots, false) == false,
                "canonicalize fails on a parent that does not exist, so it is refused"
            );
            assert!(
                !is_writable_target(&outside.join("a.pdf"), &roots, false),
                "a file outside every root must be refused"
            );
            assert!(
                is_writable_target(&outside.join("a.pdf"), &roots, true),
                "unless the user picked or dropped it, which grants the runtime scope"
            );
            assert!(
                !is_writable_target(&root.join("..").join("elsewhere").join("a.pdf"), &roots, false),
                "a traversal out of a root must not be read as inside it"
            );
            let _ = fs::remove_dir_all(&dir);
        }

        /// A path with no filename cannot be a save target and must not panic.
        #[test]
        fn a_path_with_no_file_name_is_refused() {
            let err = atomic_replace(std::path::Path::new("/"), b"NEW").expect_err("must refuse");
            assert!(!err.is_empty());
        }
    }

    use crate::word_outcome;
    use crate::word_save_format;

    /// [WORD] The save-format constants are AppleScript, not English.
    ///
    /// Two shipped as prose and were rejected by the compiler, not by Word:
    /// "format Microsoft Word 97-2004 document" and "format rtf format" both
    /// raise -2741 at compile time, so PDF to .doc and PDF to .rtf could never
    /// have run on any Mac. Every value below was checked with `osacompile`
    /// against a real Word install; this pins them so the next tidy-up of the
    /// wording has to notice.
    #[test]
    /// A written document beats a complaint about it.
    ///
    /// Reported from a real session: a conversion showed a Word error and the
    /// converted file was sitting on the Desktop. The automation's exit status
    /// covers everything it did, including closing Word, so a failure after the
    /// save was reported as a failure of the save.
    #[test]
    fn a_document_that_exists_is_a_success_whatever_word_said() {
        let out = word_outcome(Some(vec![1, 2, 3]), Some("AppleEvent timed out. (-1712)".into()));
        assert_eq!(out, Ok(vec![1, 2, 3]));
    }

    #[test]
    fn a_document_with_no_complaint_is_still_a_success() {
        assert_eq!(word_outcome(Some(vec![9]), None), Ok(vec![9]));
    }

    #[test]
    fn nothing_written_reports_what_went_wrong() {
        let out = word_outcome(None, Some("Word conversion failed: boom".into()));
        assert_eq!(out, Err("Word conversion failed: boom".to_string()));
    }

    #[test]
    fn nothing_written_and_nothing_said_is_still_a_failure() {
        // Never silently succeed with no bytes: the caller would hand the user
        // an empty file and call it converted.
        assert!(word_outcome(None, None).is_err());
    }

    #[test]
    fn word_save_formats_are_the_verified_constants() {
        assert_eq!(word_save_format("pdf"), Some("format PDF"));
        assert_eq!(word_save_format("docx"), Some("format document"));
        assert_eq!(word_save_format("doc"), Some("format document97"));
        assert_eq!(word_save_format("rtf"), Some("format rtf"));
        assert_eq!(word_save_format("txt"), Some("format plain text"));
    }

    #[test]
    fn word_save_format_refuses_what_word_cannot_write() {
        assert_eq!(word_save_format("epub"), None);
        assert_eq!(word_save_format(""), None);
    }

    /// The shapes that do not compile, kept as an executable record of the bug.
    #[test]
    fn word_save_formats_carry_no_spaces_in_their_tail() {
        // A constant made of several bare words is what -2741 objects to: the
        // parser reaches the second one and stops. Every accepted value is
        // either a single trailing token or a known-good multiword constant.
        for fmt in ["pdf", "docx", "doc", "rtf", "txt"] {
            let c = word_save_format(fmt).unwrap();
            assert!(c.starts_with("format "), "{c} should start with the format keyword");
            assert!(!c.contains("97-2004"), "{c} still carries the prose spelling");
            assert!(!c.ends_with(" format"), "{c} still carries the doubled keyword");
        }
    }
}

