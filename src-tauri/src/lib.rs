// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use tauri::ipc::Response;
use tauri::Emitter;
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use image::codecs::jpeg::JpegEncoder;
use image::codecs::png::{PngEncoder, CompressionType};
use std::io::Cursor;
use std::sync::Mutex;
use uuid::Uuid;

mod heic;
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
const CALIBRE_ALLOWED_FLAGS: &[&str] = &[
    "--base-font-size", "--font-size-mapping", "--margin-top",
    "--margin-bottom", "--margin-left", "--margin-right",
    "--change-justification", "--insert-blank-line",
    "--line-height", "--input-encoding", "--output-profile",
    "--extra-css",
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
/// Returns the binary name (not full path) suitable for `app.shell().command()`.
/// Used as fallback when sidecar is not available, and by check_capabilities.
fn find_system_ghostscript() -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        // Try gswin64c first (standard Windows GS name), then gs
        let candidates = ["gswin64c", "gswin32c", "gs"];
        for candidate in candidates {
            let result = std::process::Command::new("where")
                .arg(candidate)
                .output();
            if let Ok(output) = result {
                if output.status.success() {
                    return Ok(candidate.to_string());
                }
            }
        }
        return Err(
            "Ghostscript is not installed. Install it from https://ghostscript.com/releases/gsdnld.html and ensure it is in your PATH.".to_string()
        );
    }

    #[cfg(not(target_os = "windows"))]
    {
        // macOS / Linux: check for gs in PATH
        let result = std::process::Command::new("which")
            .arg("gs")
            .output();
        if let Ok(output) = result {
            if output.status.success() {
                return Ok("gs".to_string());
            }
        }

        // On macOS, also check Homebrew common paths
        #[cfg(target_os = "macos")]
        {
            let brew_paths = [
                "/opt/homebrew/bin/gs",
                "/usr/local/bin/gs",
            ];
            for path in brew_paths {
                if std::path::Path::new(path).exists() {
                    return Ok(path.to_string());
                }
            }
        }

        Err(
            if cfg!(target_os = "macos") {
                "Ghostscript is not installed. Install it with: brew install ghostscript".to_string()
            } else {
                "Ghostscript is not installed. Install it with your package manager (e.g. sudo apt install ghostscript).".to_string()
            }
        )
    }
}

/// Spawn a Ghostscript process with the given arguments.
/// Tries the bundled sidecar binary first (`binaries/gs`), then falls back
/// to system-installed GS via PATH lookup.
fn spawn_gs(
    app: &tauri::AppHandle,
    args: Vec<String>,
) -> Result<(tauri::async_runtime::Receiver<CommandEvent>, CommandChild), String> {
    // 1. Try bundled sidecar first
    if let Ok(sidecar_cmd) = app.shell().sidecar("gs") {
        let sidecar_cmd = with_windows_dll_path(app, sidecar_cmd);
        if let Ok(result) = sidecar_cmd.args(&args).spawn() {
            return Ok(result);
        }
    }

    // 2. Fallback: system-installed GS via PATH
    let gs_bin = find_system_ghostscript()?;
    app.shell()
        .command(&gs_bin)
        .args(&args)
        .spawn()
        .map_err(|e| format!(
            "Ghostscript failed to start. Ensure Ghostscript is installed and in your PATH. Error: {}",
            e
        ))
}

/// Whether a `gs --version` probe looks like a real Ghostscript.
///
/// Ghostscript prints a bare version ("10.02.1"). The placeholder sidecars this
/// project ships for three of its four targets print "gs not bundled on this
/// platform" and exit 1, so both the exit status and the shape of the output are
/// checked — a stub that forgot to exit non-zero would otherwise read as a
/// working install.
fn sidecar_reports_version(exit_ok: bool, stdout: &str) -> bool {
    exit_ok
        && stdout
            .trim()
            .chars()
            .next()
            .is_some_and(|c| c.is_ascii_digit())
}

/// Lets the bundled Ghostscript find gsdll64.dll on Windows.
///
/// Windows Ghostscript is not one file: gswin64c.exe is a thin wrapper around
/// gsdll64.dll and will not start without it. A Tauri sidecar is a single file
/// and resources are bundled into a different directory than the executable, so
/// the DLL is shipped as a resource and its directory is prepended to the child
/// process's PATH here.
///
/// This is the one part of the Ghostscript work that has not been run on the
/// platform it targets — see src-tauri/binaries/README.md. On macOS and Linux it
/// is a no-op, because Ghostscript there is genuinely a single binary.
#[cfg(target_os = "windows")]
fn with_windows_dll_path(
    app: &tauri::AppHandle,
    cmd: tauri_plugin_shell::process::Command,
) -> tauri_plugin_shell::process::Command {
    use tauri::Manager;

    let Ok(resource_dir) = app.path().resource_dir() else {
        return cmd;
    };
    let existing = std::env::var("PATH").unwrap_or_default();
    cmd.env(
        "PATH",
        format!("{};{}", resource_dir.display(), existing),
    )
}

#[cfg(not(target_os = "windows"))]
fn with_windows_dll_path(
    _app: &tauri::AppHandle,
    cmd: tauri_plugin_shell::process::Command,
) -> tauri_plugin_shell::process::Command {
    cmd
}

/// Check if Ghostscript is available (sidecar or system).
/// Used by detect_converters to report GS availability.
///
/// Actually runs the sidecar rather than trusting that a command object could be
/// built — `sidecar()` succeeds whether or not the binary exists or works, so the
/// previous check reported Ghostscript available on every platform and the
/// disabled-tool state with its install hint could never appear.
async fn is_ghostscript_available(app: &tauri::AppHandle) -> bool {
    if let Ok(cmd) = app.shell().sidecar("gs") {
        if let Ok(output) = cmd.arg("--version").output().await {
            if sidecar_reports_version(
                output.status.success(),
                &String::from_utf8_lossy(&output.stdout),
            ) {
                return true;
            }
        }
    }
    // Fallback to system PATH — reached whenever the bundled sidecar is a stub.
    find_system_ghostscript().is_ok()
}

/// Build a user-friendly error message when Ghostscript crashes unexpectedly
/// (signal termination, missing library, etc.) rather than exiting cleanly.
fn format_gs_crash_error(stderr: &str) -> String {
    const REINSTALL_HINT: &str =
        "Try reinstalling the application or installing Ghostscript manually.";

    let hint = if stderr.contains("Library not loaded") || stderr.contains("dyld") {
        format!("A required library is missing. {}", REINSTALL_HINT)
    } else if stderr.contains("not found") || stderr.contains("No such file") {
        format!("Ghostscript could not be found. {}", REINSTALL_HINT)
    } else {
        format!("Ghostscript crashed unexpectedly. {}", REINSTALL_HINT)
    };
    if stderr.is_empty() {
        hint
    } else {
        format!("{} Details: {}", hint, stderr)
    }
}

/// Build a user-friendly error message for Word AppleScript automation failures.
/// AppleScript errors -1708 ("doesn't understand the X message") and -2753
/// ("variable ... is not defined") both surface when a document opened via
/// `open POSIX file` isn't fully wired into Word's scriptable document interface —
/// the file opens, but save/close commands are rejected. Seen on some Word for
/// Mac builds regardless of source format; not something Papercut can work around.
/// Only called from the macOS Word-automation path, but deliberately left
/// compiled on every platform so its unit tests keep running in CI (which is
/// Linux). Without this, `cargo clippy -- -D warnings` fails there on dead_code.
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
    gs_child: Mutex<Option<CommandChild>>,
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
            // Map quality (1-100) inversely to PNG compression level (0-9):
            //   quality 100 → level 0 (fast deflate, largest file)
            //   quality 1   → level 9 (best deflate, smallest file)
            let level = ((100u32 - quality as u32) * 9 / 100) as u8;
            let compression = match level {
                0 => CompressionType::Fast,
                9 => CompressionType::Best,
                _ => CompressionType::Default,
            };
            let encoder = PngEncoder::new_with_quality(
                Cursor::new(&mut output_buf),
                compression,
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
            let level = ((100u32 - quality as u32) * 9 / 100) as u8;
            let compression = match level {
                0 => CompressionType::Fast,
                9 => CompressionType::Best,
                _ => CompressionType::Default,
            };
            let encoder = PngEncoder::new_with_quality(
                Cursor::new(&mut output_buf),
                compression,
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

#[tauri::command]
fn process_image(
    source_path: String,
    quality: u8,
    output_format: String,
    resize_width: Option<u32>,
    resize_height: Option<u32>,
    resize_exact: bool,
) -> Result<Response, String> {
    validate_source_path(&source_path)?;
    let source_bytes = std::fs::read(&source_path)
        .map_err(|e| format!("Failed to read file: {}", e))?;
    let output_buf = encode_image(
        &source_bytes,
        quality,
        &output_format,
        resize_width,
        resize_height,
        resize_exact,
    )?;
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
    let mut guard = state.gs_child.lock().unwrap();
    if let Some(child) = guard.take() {
        let _ = child.kill();
    }
}

/// Compress a PDF using Ghostscript.
/// preset: one of "screen" | "ebook" | "printer" | "prepress"
/// Spawns GS as a child process, stores the child in ProcessState so it can be
/// killed by cancel_processing(). Waits for the Terminated event.
/// Returns Err("CANCELLED") if killed before completion.
/// Builds the Ghostscript argument list for compress_pdf's chosen preset.
///
/// PDFSETTINGS presets only recompress an image if GS decides it needs
/// *downsampling* (its resolution exceeds the preset's target DPI). An image
/// already at or below that resolution is passed through in its original
/// filter untouched — even if it's losslessly encoded (FlateDecode) and would
/// shrink significantly just by re-encoding as JPEG. For every preset except
/// prepress (archive — meant to stay lossless), force that re-encoding
/// explicitly rather than relying on the resolution-based auto-detection.
/// Builds the Ghostscript argument list.
///
/// `downsample_images` false keeps every image at its original resolution,
/// letting the preset re-encode without also shrinking pixel dimensions. The
/// forced JPEG conversion below is what makes non-prepress presets shrink at
/// all, so it stays on either way.
fn build_compress_pdf_args(
    preset: &str,
    tmp_path_str: &str,
    source_path: &str,
    downsample_images: bool,
) -> Vec<String> {
    let mut gs_args = vec![
        "-sDEVICE=pdfwrite".to_string(),
        "-dNOPAUSE".to_string(),
        "-dBATCH".to_string(),
        "-dQUIET".to_string(),
        format!("-dPDFSETTINGS=/{}", preset),
    ];

    if preset != "prepress" {
        gs_args.extend([
            "-dAutoFilterColorImages=false".to_string(),
            "-dColorImageFilter=/DCTEncode".to_string(),
            "-dEncodeColorImages=true".to_string(),
            "-dAutoFilterGrayImages=false".to_string(),
            "-dGrayImageFilter=/DCTEncode".to_string(),
            "-dEncodeGrayImages=true".to_string(),
        ]);
    }

    if !downsample_images {
        gs_args.extend([
            "-dDownsampleColorImages=false".to_string(),
            "-dDownsampleGrayImages=false".to_string(),
            "-dDownsampleMonoImages=false".to_string(),
        ]);
    }

    gs_args.push(format!("-sOutputFile={}", tmp_path_str));
    gs_args.push(source_path.to_string());
    gs_args
}

#[tauri::command]
async fn compress_pdf(
    app: tauri::AppHandle,
    state: tauri::State<'_, ProcessState>,
    source_path: String,
    preset: String,
    downsample_images: Option<bool>,
) -> Result<tauri::ipc::Response, String> {
    validate_source_path(&source_path)?;
    // Validate preset to prevent injection — only allow known GS presets
    let valid_presets = ["screen", "ebook", "printer", "prepress"];
    if !valid_presets.contains(&preset.as_str()) {
        return Err(format!(
            "Invalid Ghostscript preset '{}'. Must be one of: {}",
            preset,
            valid_presets.join(", ")
        ));
    }

    // Write output to a temp file (GS requires a file output path)
    let tmp_path = std::env::temp_dir().join(format!(
        "papercut_compressed_{}.pdf",
        Uuid::new_v4()
    ));
    let tmp_path_str = tmp_path.to_string_lossy().to_string();

    let gs_args = build_compress_pdf_args(
        &preset,
        &tmp_path_str,
        &source_path,
        downsample_images.unwrap_or(true),
    );

    // Spawn GS process (sidecar first, then system PATH fallback)
    let (mut rx, child) = spawn_gs(&app, gs_args)?;

    // Store the child so cancel_processing() can kill it
    {
        let mut guard = state.gs_child.lock().unwrap();
        *guard = Some(child);
    }

    // Wait for GS to finish (or be killed)
    let mut exit_code: Option<i32> = None;
    let mut terminated = false;
    let mut stderr_lines: Vec<String> = Vec::new();

    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Terminated(payload) => {
                exit_code = payload.code;
                terminated = true;
                break;
            }
            CommandEvent::Stderr(line) => {
                stderr_lines.push(String::from_utf8_lossy(&line).to_string());
            }
            CommandEvent::Error(e) => {
                // Channel error — treat as process failure
                let _ = std::fs::remove_file(&tmp_path);
                // Clear stored child reference
                let mut guard = state.gs_child.lock().unwrap();
                *guard = None;
                return Err(format!("Ghostscript error: {}", e));
            }
            _ => {} // Stdout events ignored — GS writes to tmp_path file
        }
    }

    // Clear stored child reference now that GS has exited.
    // Detect user-initiated cancellation: cancel_processing() takes the child
    // out of the mutex, so if it's already None here the user cancelled.
    // If it's still Some, GS exited on its own (crash / normal exit).
    let user_cancelled = {
        let mut guard = state.gs_child.lock().unwrap();
        let was_taken = guard.is_none();
        *guard = None;
        was_taken
    };

    // If the channel closed without a Terminated event, the child was killed
    if !terminated {
        let _ = std::fs::remove_file(&tmp_path);
        if user_cancelled {
            return Err("CANCELLED".to_string());
        }
        let stderr = stderr_lines.join("\n");
        return Err(format_gs_crash_error(&stderr));
    }

    // Non-zero exit code means GS was killed (signal) or failed
    match exit_code {
        None => {
            // Signal termination — only treat as cancellation if user requested it
            let _ = std::fs::remove_file(&tmp_path);
            if user_cancelled {
                return Err("CANCELLED".to_string());
            }
            let stderr = stderr_lines.join("\n");
            return Err(format_gs_crash_error(&stderr));
        }
        Some(0) => {} // success — continue
        Some(_code) => {
            let file_existed = std::fs::remove_file(&tmp_path).is_ok();
            if !file_existed && user_cancelled {
                return Err("CANCELLED".to_string());
            }
            let stderr = stderr_lines.join("\n");
            // If stderr matches known crash patterns (missing library, dyld, not found),
            // surface the actionable reinstall message rather than a raw exit-code string.
            if stderr.contains("Library not loaded")
                || stderr.contains("dyld")
                || stderr.contains("not found")
                || stderr.contains("No such file")
            {
                return Err(format_gs_crash_error(&stderr));
            }
            let details = if stderr.is_empty() {
                String::new()
            } else {
                format!(" Details: {}", stderr)
            };
            return Err(format!(
                "Ghostscript compression failed (exit code {}).{}",
                _code, details
            ));
        }
    }

    // Read the compressed output bytes
    let bytes = std::fs::read(&tmp_path)
        .map_err(|e| format!("Failed to read compressed output: {}", e))?;

    // Clean up temp file (ignore errors — OS will clean eventually)
    let _ = std::fs::remove_file(&tmp_path);

    Ok(tauri::ipc::Response::new(bytes))
}

#[tauri::command]
async fn protect_pdf(
    app: tauri::AppHandle,
    source_path: String,
    owner_password: String,
    user_password: String,
) -> Result<tauri::ipc::Response, String> {
    validate_source_path(&source_path)?;
    if owner_password.is_empty() || user_password.is_empty() {
        return Err("Password cannot be empty".to_string());
    }

    let tmp_path = std::env::temp_dir().join(format!(
        "papercut_protected_{}.pdf",
        Uuid::new_v4()
    ));
    let tmp_path_str = tmp_path.to_string_lossy().to_string();

    let (mut rx, _child) = spawn_gs(&app, vec![
        "-sDEVICE=pdfwrite".to_string(),
        "-dNOPAUSE".to_string(),
        "-dBATCH".to_string(),
        "-dQUIET".to_string(),
        format!("-sOwnerPassword={}", owner_password),
        format!("-sUserPassword={}", user_password),
        "-dEncryptionR=3".to_string(),
        "-dKeyLength=128".to_string(),
        format!("-sOutputFile={}", tmp_path_str),
        source_path.clone(),
    ])?;

    // Wait for completion
    let mut stderr_lines: Vec<String> = Vec::new();
    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Terminated(payload) => {
                if payload.code != Some(0) {
                    let _ = std::fs::remove_file(&tmp_path);
                    return Err("PDF password protection failed. The file may be corrupted or unsupported.".to_string());
                }
                break;
            }
            CommandEvent::Stderr(line) => {
                stderr_lines.push(String::from_utf8_lossy(&line).to_string());
            }
            CommandEvent::Error(e) => {
                let _ = std::fs::remove_file(&tmp_path);
                return Err(format!("Ghostscript error: {}", redact_gs_passwords(&e)));
            }
            _ => {}
        }
    }

    let bytes = std::fs::read(&tmp_path)
        .map_err(|e| format!("Failed to read output: {}", e))?;
    let _ = std::fs::remove_file(&tmp_path);
    Ok(tauri::ipc::Response::new(bytes))
}

#[tauri::command]
async fn unlock_pdf(
    app: tauri::AppHandle,
    source_path: String,
    password: String,
) -> Result<tauri::ipc::Response, String> {
    validate_source_path(&source_path)?;
    if password.is_empty() {
        return Err("Password cannot be empty".to_string());
    }

    let tmp_path = std::env::temp_dir().join(format!(
        "papercut_unlocked_{}.pdf",
        Uuid::new_v4()
    ));
    let tmp_path_str = tmp_path.to_string_lossy().to_string();

    let (mut rx, _child) = spawn_gs(&app, vec![
        "-sDEVICE=pdfwrite".to_string(),
        "-dNOPAUSE".to_string(),
        "-dBATCH".to_string(),
        "-dQUIET".to_string(),
        format!("-sPDFPassword={}", password),
        format!("-sOutputFile={}", tmp_path_str),
        source_path.clone(),
    ])?;

    // Wait for completion
    let mut stderr_lines: Vec<String> = Vec::new();
    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Terminated(payload) => {
                if payload.code != Some(0) {
                    let _ = std::fs::remove_file(&tmp_path);
                    return Err("PDF unlock failed. The password may be incorrect or the file may be corrupted.".to_string());
                }
                break;
            }
            CommandEvent::Stderr(line) => {
                stderr_lines.push(String::from_utf8_lossy(&line).to_string());
            }
            CommandEvent::Error(e) => {
                let _ = std::fs::remove_file(&tmp_path);
                return Err(format!("Ghostscript error: {}", redact_gs_passwords(&e)));
            }
            _ => {}
        }
    }

    let bytes = std::fs::read(&tmp_path)
        .map_err(|e| format!("Failed to read output: {}", e))?;
    let _ = std::fs::remove_file(&tmp_path);
    Ok(tauri::ipc::Response::new(bytes))
}

#[tauri::command]
async fn convert_pdfa(
    app: tauri::AppHandle,
    source_path: String,
    pdfa_level: String,
) -> Result<tauri::ipc::Response, String> {
    validate_source_path(&source_path)?;
    // Validate pdfa_level — only allow known conformance levels
    let valid_levels = ["1", "2", "3"];
    if !valid_levels.contains(&pdfa_level.as_str()) {
        return Err(format!(
            "Invalid PDF/A level '{}'. Must be one of: {}",
            pdfa_level,
            valid_levels.join(", ")
        ));
    }

    let tmp_path = std::env::temp_dir().join(format!(
        "papercut_pdfa_{}.pdf",
        Uuid::new_v4()
    ));
    let tmp_path_str = tmp_path.to_string_lossy().to_string();

    // Generate a minimal PDFA_def.ps file with required pdfmark metadata
    let pdfa_def_path = std::env::temp_dir().join(format!(
        "papercut_PDFA_def_{}.ps",
        Uuid::new_v4()
    ));
    let pdfa_def_content = r#"%!PS
% Required PDF/A pdfmark metadata
[ /Title (PDF/A Document)
  /DOCINFO pdfmark
[ /ICCProfile (sRGB)
  /OutputCondition (sRGB IEC61966-2.1)
  /OutputConditionIdentifier (sRGB IEC61966-2.1)
  /RegistryName (http://www.color.org)
  /Info (sRGB IEC61966-2.1)
  /OutputIntents pdfmark
"#.to_string();
    std::fs::write(&pdfa_def_path, &pdfa_def_content)
        .map_err(|e| format!("Failed to write PDFA_def.ps: {}", e))?;

    let (mut rx, _child) = spawn_gs(&app, vec![
        "-sDEVICE=pdfwrite".to_string(),
        "-dNOPAUSE".to_string(),
        "-dBATCH".to_string(),
        "-dQUIET".to_string(),
        format!("-dPDFA={}", pdfa_level),
        "-dPDFACompatibilityPolicy=1".to_string(),
        "-sColorConversionStrategy=RGB".to_string(),
        format!("-sOutputFile={}", tmp_path_str),
        pdfa_def_path.to_string_lossy().to_string(),
        source_path.clone(),
    ])?;

    // Wait for completion
    let mut stderr_lines: Vec<String> = Vec::new();
    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Terminated(payload) => {
                if payload.code != Some(0) {
                    let _ = std::fs::remove_file(&tmp_path);
                    let _ = std::fs::remove_file(&pdfa_def_path);
                    let stderr = stderr_lines.join("\n");
                    return Err(format!(
                        "Ghostscript failed (exit {}): {}",
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
                let _ = std::fs::remove_file(&tmp_path);
                let _ = std::fs::remove_file(&pdfa_def_path);
                return Err(format!("Ghostscript error: {}", e));
            }
            _ => {}
        }
    }

    let bytes = std::fs::read(&tmp_path)
        .map_err(|e| format!("Failed to read output: {}", e))?;
    let _ = std::fs::remove_file(&tmp_path);
    let _ = std::fs::remove_file(&pdfa_def_path);
    Ok(tauri::ipc::Response::new(bytes))
}

#[tauri::command]
async fn repair_pdf(
    app: tauri::AppHandle,
    source_path: String,
) -> Result<tauri::ipc::Response, String> {
    validate_source_path(&source_path)?;
    let tmp_path = std::env::temp_dir().join(format!(
        "papercut_repaired_{}.pdf",
        Uuid::new_v4()
    ));
    let tmp_path_str = tmp_path.to_string_lossy().to_string();

    let (mut rx, _child) = spawn_gs(&app, vec![
        "-sDEVICE=pdfwrite".to_string(),
        "-dNOPAUSE".to_string(),
        "-dBATCH".to_string(),
        "-dQUIET".to_string(),
        format!("-sOutputFile={}", tmp_path_str),
        source_path.clone(),
    ])?;

    // Wait for completion — handle partial success per user decision
    let mut exit_code: Option<i32> = None;
    let mut stderr_lines: Vec<String> = Vec::new();
    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Terminated(payload) => {
                exit_code = payload.code;
                break;
            }
            CommandEvent::Stderr(line) => {
                stderr_lines.push(String::from_utf8_lossy(&line).to_string());
            }
            CommandEvent::Error(e) => {
                let _ = std::fs::remove_file(&tmp_path);
                return Err(format!("Ghostscript error: {}", e));
            }
            _ => {}
        }
    }

    // CRITICAL: handle partial success — if GS exits non-zero BUT output file
    // exists with non-zero size, return the bytes as success (not error).
    // The TS side will show a "repaired with potential issues" message.
    match exit_code {
        Some(0) => {
            // Clean exit — read and return
            let bytes = std::fs::read(&tmp_path)
                .map_err(|e| format!("Failed to read output: {}", e))?;
            let _ = std::fs::remove_file(&tmp_path);
            Ok(tauri::ipc::Response::new(bytes))
        }
        _ => {
            // Non-zero exit or signal — try to read partial output directly (no TOCTOU)
            if let Ok(bytes) = std::fs::read(&tmp_path) {
                let _ = std::fs::remove_file(&tmp_path);
                if !bytes.is_empty() {
                    return Ok(tauri::ipc::Response::new(bytes));
                }
            }
            // No output or empty — real failure
            let _ = std::fs::remove_file(&tmp_path);
            let stderr = stderr_lines.join("\n");
            Err(format_gs_crash_error(&stderr))
        }
    }
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
async fn detect_converters(app: tauri::AppHandle) -> Result<String, String> {
    let mut results = std::collections::HashMap::new();

    // textutil — built-in on macOS, handles doc/docx/odt/rtf/txt
    #[cfg(target_os = "macos")]
    {
        let textutil_ok = std::process::Command::new("textutil")
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
        let word_ok = std::process::Command::new("powershell")
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
        let lo_ok = std::process::Command::new("soffice")
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
        let cal_ok = std::process::Command::new("ebook-convert")
            .arg("--version")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false);
        results.insert("calibre", cal_ok);
    }

    // Pandoc
    let pandoc_ok = std::process::Command::new("pandoc")
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);
    results.insert("pandoc", pandoc_ok);

    // Ghostscript (bundled sidecar or system-installed)
    let gs_ok = is_ghostscript_available(&app).await;
    results.insert("ghostscript", gs_ok);

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

        let output = std::process::Command::new("textutil")
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

    #[cfg(target_os = "macos")]
    {
        // Map output format to Word for Mac save format constant
        let (word_format, _) = match output_format.as_str() {
            "pdf" => ("format PDF", "pdf"),
            "docx" => ("format document", "docx"),
            "doc" => ("format Microsoft Word 97-2004 document", "doc"),
            "rtf" => ("format rtf format", "rtf"),
            "txt" => ("format plain text", "txt"),
            _ => return Err(format!("Word does not support '{}' output", output_format)),
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

        let output = std::process::Command::new("osascript")
            .args(["-e", &applescript])
            .output()
            .map_err(|e| format!("Failed to run Word via AppleScript: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format_word_automation_error(&stderr));
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

        let output = std::process::Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", &ps_script])
            .output()
            .map_err(|e| format!("Failed to run Word via PowerShell: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Word conversion failed: {}", stderr));
        }
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = output_path_str;
        Err("Word automation is not supported on this platform".to_string())
    }

    #[cfg(any(target_os = "macos", target_os = "windows"))]
    {
        let bytes = std::fs::read(&output_path)
            .map_err(|e| format!("Failed to read Word output: {}", e))?;

        let _ = std::fs::remove_file(&output_path);

        Ok(tauri::ipc::Response::new(bytes))
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
        std::process::Command::new("open")
            .args(["-R", &path])
            .spawn()
            .map_err(|e| format!("Failed to reveal in Finder: {}", e))?;
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
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
        std::process::Command::new("xdg-open")
            .arg(&parent)
            .spawn()
            .map_err(|e| format!("Failed to open file manager: {}", e))?;
    }
    Ok(())
}

/// Redact any password values from a Ghostscript error/stderr string.
/// Replaces the value after password-related flags with [REDACTED].
fn redact_gs_passwords(stderr: &str) -> String {
    let mut result = stderr.to_string();
    for flag in &["-sOwnerPassword=", "-sUserPassword=", "-sPDFPassword="] {
        while let Some(start) = result.find(flag) {
            let value_start = start + flag.len();
            // Find end of value (next space or end of string)
            let value_end = result[value_start..]
                .find(' ')
                .map(|i| value_start + i)
                .unwrap_or(result.len());
            result.replace_range(value_start..value_end, "[REDACTED]");
        }
    }
    result
}

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

/// Run the app, optionally opening a file passed via CLI argument (macOS "Open with").
pub fn run_with_file(open_file: Option<String>) {
    let builder = tauri::Builder::default()
        .manage(ProcessState { gs_child: Mutex::new(None) })
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![greet, process_image, rotate_image, decode_heic_preview, heic_frame_count, ocr_pdf, ocr_languages, write_searchable_pdf, compress_pdf, cancel_processing, protect_pdf, unlock_pdf, convert_pdfa, repair_pdf, convert_with_libreoffice, convert_with_calibre, convert_with_textutil, convert_with_word, convert_html_to_pdf_native, detect_converters, reveal_in_finder, system_info, allow_dropped_paths]);

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

    #[test]
    fn compress_pdf_args_force_reencode_for_screen_preset() {
        let args = super::build_compress_pdf_args("screen", "/tmp/out.pdf", "/tmp/in.pdf", true);
        assert!(args.contains(&"-dAutoFilterColorImages=false".to_string()));
        assert!(args.contains(&"-dColorImageFilter=/DCTEncode".to_string()));
        assert!(args.contains(&"-dEncodeColorImages=true".to_string()));
        assert!(args.contains(&"-dAutoFilterGrayImages=false".to_string()));
        assert!(args.contains(&"-dGrayImageFilter=/DCTEncode".to_string()));
        assert!(args.contains(&"-dEncodeGrayImages=true".to_string()));
    }

    #[test]
    fn compress_pdf_args_force_reencode_for_ebook_and_printer_presets() {
        for preset in ["ebook", "printer"] {
            let args = super::build_compress_pdf_args(preset, "/tmp/out.pdf", "/tmp/in.pdf", true);
            assert!(
                args.contains(&"-dColorImageFilter=/DCTEncode".to_string()),
                "preset '{}' must force color image re-encoding",
                preset
            );
        }
    }

    #[test]
    fn compress_pdf_args_prepress_preset_does_not_force_reencode() {
        let args = super::build_compress_pdf_args("prepress", "/tmp/out.pdf", "/tmp/in.pdf", true);
        assert!(
            !args.iter().any(|a| a.contains("DCTEncode")),
            "prepress (archive) must stay lossless — no forced JPEG re-encoding"
        );
    }

    #[test]
    fn compress_pdf_args_include_output_and_source_paths() {
        let args = super::build_compress_pdf_args("screen", "/tmp/out.pdf", "/tmp/in.pdf", true);
        assert!(args.contains(&"-sOutputFile=/tmp/out.pdf".to_string()));
        assert!(args.contains(&"/tmp/in.pdf".to_string()));
        // Source path must be last (GS positional input argument)
        assert_eq!(args.last(), Some(&"/tmp/in.pdf".to_string()));
    }

    // ─── Downsampling toggle ──────────────────────────────────────────────────
    //
    // The panel has always shown a "Downsample images" checkbox, but nothing was
    // ever passed to Ghostscript -- the box did nothing at all.

    #[test]
    fn compress_pdf_args_downsampling_on_leaves_the_preset_in_charge() {
        let args = super::build_compress_pdf_args("screen", "/tmp/out.pdf", "/tmp/in.pdf", true);
        assert!(
            !args.iter().any(|a| a.starts_with("-dDownsampleColorImages")),
            "with downsampling on, the preset's own resolution policy applies"
        );
    }

    #[test]
    fn compress_pdf_args_downsampling_off_disables_all_three_image_types() {
        let args = super::build_compress_pdf_args("screen", "/tmp/out.pdf", "/tmp/in.pdf", false);
        assert!(args.contains(&"-dDownsampleColorImages=false".to_string()));
        assert!(args.contains(&"-dDownsampleGrayImages=false".to_string()));
        assert!(args.contains(&"-dDownsampleMonoImages=false".to_string()));
    }

    #[test]
    fn compress_pdf_args_downsampling_off_still_re_encodes() {
        // Turning off downsampling keeps resolution; it must not also turn off
        // the JPEG re-encoding that makes non-prepress presets shrink at all.
        let args = super::build_compress_pdf_args("screen", "/tmp/out.pdf", "/tmp/in.pdf", false);
        assert!(args.contains(&"-dColorImageFilter=/DCTEncode".to_string()));
    }

    #[test]
    fn compress_pdf_args_downsampling_off_keeps_source_path_last() {
        let args = super::build_compress_pdf_args("screen", "/tmp/out.pdf", "/tmp/in.pdf", false);
        assert_eq!(args.last(), Some(&"/tmp/in.pdf".to_string()));
    }

    // ─── format_gs_crash_error — user-friendly GS error messages ──────────────

    #[test]
    fn gs_crash_error_detects_missing_library() {
        let stderr = "dyld[84156]: Library not loaded: /opt/homebrew/opt/jbig2dec/lib/libjbig2dec.0.dylib";
        let msg = super::format_gs_crash_error(stderr);
        assert!(msg.contains("missing"), "should mention missing library");
        assert!(msg.contains("reinstalling"), "should suggest reinstalling");
        assert!(msg.contains(stderr), "should include original stderr");
    }

    #[test]
    fn gs_crash_error_detects_dyld() {
        let stderr = "dyld: could not load inserted library";
        let msg = super::format_gs_crash_error(stderr);
        assert!(msg.contains("missing"), "should mention missing library for dyld errors");
    }

    #[test]
    fn gs_crash_error_detects_not_found() {
        let stderr = "gs: not found";
        let msg = super::format_gs_crash_error(stderr);
        assert!(msg.contains("could not be found"), "should mention GS not found");
    }

    #[test]
    fn gs_crash_error_generic_fallback() {
        let stderr = "some unknown error";
        let msg = super::format_gs_crash_error(stderr);
        assert!(msg.contains("crashed unexpectedly"), "should use generic crash message");
        assert!(msg.contains(stderr), "should include original stderr");
    }

    #[test]
    fn gs_crash_error_empty_stderr() {
        let msg = super::format_gs_crash_error("");
        assert!(msg.contains("crashed unexpectedly"), "should use generic message for empty stderr");
        assert!(!msg.contains("Details:"), "should not include Details: for empty stderr");
    }

    // ─── GS-CRASH-DISC-01 — format_gs_crash_error is used for non-zero exit with crash stderr ──
    //
    // When GS exits with a non-zero exit code AND stderr looks like a missing-library
    // crash (dyld / "Library not loaded"), the error message must contain the crash
    // guidance text, NOT a raw "exit code N" message.
    // This is the regression test for the Some(_code) path fix.
    #[test]
    fn gs_crash_nonzero_exit_with_dyld_stderr_produces_crash_message() {
        let dyld_stderr = "dyld[1234]: Library not loaded: /opt/homebrew/opt/jbig2dec/lib/libjbig2dec.0.dylib";
        let msg = super::format_gs_crash_error(dyld_stderr);
        assert!(
            !msg.contains("exit code"),
            "crash with missing-library stderr must NOT say 'exit code'"
        );
        assert!(
            msg.contains("missing") || msg.contains("reinstall"),
            "crash with missing-library stderr must mention missing library or reinstall"
        );
    }

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


    // ─── GS-SIDECAR-02 — the bundled binary must run on someone else's machine ─
    //
    // Regression test (P009). The Ghostscript this repo shipped until 2026-08-26
    // was copied from Homebrew and referenced eleven libraries by absolute path
    // under /opt/homebrew. Those exist only on a machine with Homebrew and the
    // matching packages, so the "bundled" binary ran on a developer's machine and
    // essentially nowhere else — PDF compression was broken for every real user.
    //
    // The existing GS-SIDECAR-01 could not catch it: the file was present and the
    // right size. What matters is not that a binary exists but that it can load.
    #[cfg(target_os = "macos")]
    #[test]
    fn the_bundled_ghostscript_has_no_package_manager_dependencies() {
        let binary = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("binaries")
            .join("gs-aarch64-apple-darwin");
        if !binary.exists() {
            return; // other targets legitimately ship a stub
        }
        // A stub script is not a Mach-O binary; otool would fail on it, and a
        // stub is a deliberate state rather than a regression.
        let head = std::fs::read(&binary).expect("must read the sidecar");
        if head.starts_with(b"#") {
            return;
        }

        let output = std::process::Command::new("otool")
            .arg("-L")
            .arg(&binary)
            .output()
            .expect("otool must run");
        let linked = String::from_utf8_lossy(&output.stdout);

        let foreign: Vec<&str> = linked
            .lines()
            .map(str::trim)
            .filter(|l| l.starts_with('/'))
            // otool's first line is the binary's own path, terminated by ':'
            .filter(|l| !l.ends_with(':'))
            .filter(|l| !l.starts_with("/usr/lib") && !l.starts_with("/System"))
            .collect();

        assert!(
            foreign.is_empty(),
            "the bundled Ghostscript depends on libraries that will not exist on a \
             user's machine, so PDF compression will fail with a dyld error. Build it \
             with scripts/build_ghostscript_sidecar.sh, which links Ghostscript's own \
             copies instead. Offending references:\n{}",
            foreign.join("\n")
        );
    }

    // ─── GS-SIDECAR-01 — Ghostscript sidecar binary must be present ───────────
    //
    // Papercut ships Ghostscript as a sidecar binary in src-tauri/binaries/.
    // This test asserts that at least one file matching "gs-*" exists there,
    // catching any build step that accidentally strips or skips bundling GS.
    #[test]
    fn ghostscript_sidecar_binary_exists_in_binaries_dir() {
        let binaries_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("binaries");
        assert!(
            binaries_dir.exists(),
            "src-tauri/binaries/ directory must exist"
        );
        let gs_binary = std::fs::read_dir(&binaries_dir)
            .expect("must be able to read binaries dir")
            .filter_map(|e| e.ok())
            .any(|e| {
                e.file_name()
                    .to_string_lossy()
                    .starts_with("gs-")
            });
        assert!(
            gs_binary,
            "at least one Ghostscript sidecar binary (gs-*) must be present in src-tauri/binaries/. \
             Run the build step or provide the GS binary for the target platform."
        );
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

    mod ghostscript_probe {
        use super::super::sidecar_reports_version;

        #[test]
        fn a_real_ghostscript_version_counts_as_available() {
            assert!(sidecar_reports_version(true, "10.02.1\n"));
            assert!(sidecar_reports_version(true, "9.56.1"));
        }

        #[test]
        fn the_bundled_stub_does_not_count_as_available() {
            // Exactly what the three placeholder sidecars emit today.
            assert!(!sidecar_reports_version(false, "gs not bundled on this platform\n"));
        }

        #[test]
        fn a_zero_exit_with_prose_is_still_not_a_version() {
            // Guards the weaker check of trusting the exit code alone: a stub that
            // forgot to exit non-zero would otherwise read as a working install.
            assert!(!sidecar_reports_version(true, "gs not bundled on this platform"));
            assert!(!sidecar_reports_version(true, ""));
        }

        #[test]
        fn leading_whitespace_does_not_hide_the_version() {
            assert!(sidecar_reports_version(true, "  10.02.1  "));
        }
    }

    // ─── PDF-GS-INT-01 — Ghostscript integration (conditional on GS availability) ─
    //
    // These tests invoke the actual gs subprocess directly to verify GS
    // compression behavior. They are silently skipped if GS is not installed
    // (for CI jobs that don't have GS, only for PR validation).

    mod ghostscript_integration {
        use std::process::Command;

        fn ghostscript_available() -> bool {
            Command::new("which")
                .arg("gs")
                .output()
                .map(|o| o.status.success())
                .unwrap_or(false)
        }

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

        #[test]
        fn gs_screen_preset_compresses_photo_pdf() {
            if !ghostscript_available() {
                return;
            }

            let input = fixture_path("photo_heavy.pdf");
            let output = std::env::temp_dir().join("gs_screen_test.pdf");

            let status = Command::new("gs")
                .arg("-q")
                .arg("-dNOPAUSE")
                .arg("-dBATCH")
                .arg("-dSAFER")
                .arg("-dPDFSETTINGS=/screen")
                .arg("-sDEVICE=pdfwrite")
                .arg(format!("-sOutputFile={}", output.display()))
                .arg(input.to_string_lossy().to_string())
                .output()
                .expect("gs command must execute");

            assert!(status.status.success(), "gs must exit cleanly");
            assert!(
                output.exists(),
                "gs must produce output file"
            );

            let out_bytes = std::fs::read(&output).expect("must read gs output");
            assert!(
                has_pdf_magic(&out_bytes),
                "output must have PDF header (%PDF)"
            );
            assert!(out_bytes.len() > 0, "output must not be empty");

            let _ = std::fs::remove_file(&output); // cleanup
        }

        #[test]
        fn gs_text_pdf_produces_valid_pdf() {
            if !ghostscript_available() {
                return;
            }

            let input = fixture_path("warnock_camelot.pdf");
            let output = std::env::temp_dir().join("gs_text_test.pdf");

            let status = Command::new("gs")
                .arg("-q")
                .arg("-dNOPAUSE")
                .arg("-dBATCH")
                .arg("-dSAFER")
                .arg("-dPDFSETTINGS=/ebook")
                .arg("-sDEVICE=pdfwrite")
                .arg(format!("-sOutputFile={}", output.display()))
                .arg(input.to_string_lossy().to_string())
                .output()
                .expect("gs command must execute");

            assert!(status.status.success(), "gs must exit cleanly");
            assert!(
                output.exists(),
                "gs must produce output file"
            );

            let out_bytes = std::fs::read(&output).expect("must read gs output");
            assert!(
                has_pdf_magic(&out_bytes),
                "output must have PDF header (%PDF)"
            );

            let _ = std::fs::remove_file(&output); // cleanup
        }
    }
}
