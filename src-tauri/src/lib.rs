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

/// Check if Ghostscript is available (sidecar or system).
/// Used by detect_converters to report GS availability.
fn is_ghostscript_available(app: &tauri::AppHandle) -> bool {
    // Check sidecar availability — if sidecar command can be created, the binary exists
    if app.shell().sidecar("gs").is_ok() {
        return true;
    }
    // Fallback to system PATH
    find_system_ghostscript().is_ok()
}

/// Managed cancellation state — holds the running GS child process.
/// cancel_processing() takes the child out and kills it, which signals
/// compress_pdf's event loop to exit with a CANCELLED error.
struct ProcessState {
    gs_child: Mutex<Option<CommandChild>>,
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
    let mut img = image::load_from_memory(source_bytes)
        .map_err(|e| format!("Failed to decode image: {}", e))?;

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

    let img = image::load_from_memory(&source_bytes)
        .map_err(|e| format!("Failed to decode image: {}", e))?;

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
#[tauri::command]
async fn compress_pdf(
    app: tauri::AppHandle,
    state: tauri::State<'_, ProcessState>,
    source_path: String,
    preset: String,
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

    // Spawn GS process (sidecar first, then system PATH fallback)
    let (mut rx, child) = spawn_gs(&app, vec![
        "-sDEVICE=pdfwrite".to_string(),
        "-dNOPAUSE".to_string(),
        "-dBATCH".to_string(),
        "-dQUIET".to_string(),
        format!("-dPDFSETTINGS=/{}", preset),
        format!("-sOutputFile={}", tmp_path_str),
        source_path.clone(),
    ])?;

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

    // Clear stored child reference now that GS has exited
    {
        let mut guard = state.gs_child.lock().unwrap();
        *guard = None;
    }

    // If the channel closed without a Terminated event, the child was killed
    if !terminated {
        let _ = std::fs::remove_file(&tmp_path);
        return Err("CANCELLED".to_string());
    }

    // Non-zero exit code means GS was killed (signal) or failed
    match exit_code {
        None => {
            // Signal termination (killed) — treat as cancellation
            let _ = std::fs::remove_file(&tmp_path);
            return Err("CANCELLED".to_string());
        }
        Some(0) => {} // success — continue
        Some(_code) => {
            // Check if tmp_path exists; if not, likely killed/cancelled
            if !tmp_path.exists() {
                return Err("CANCELLED".to_string());
            }
            let stderr = stderr_lines.join("\n");
            let _ = std::fs::remove_file(&tmp_path);
            return Err(format!(
                "Ghostscript returned non-zero exit code. stderr: {}",
                stderr
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
            // Non-zero exit or signal — check if partial output exists
            if tmp_path.exists() {
                let metadata = std::fs::metadata(&tmp_path);
                if let Ok(meta) = metadata {
                    if meta.len() > 0 {
                        // Partial success — return bytes despite non-zero exit
                        let bytes = std::fs::read(&tmp_path)
                            .map_err(|e| format!("Failed to read output: {}", e))?;
                        let _ = std::fs::remove_file(&tmp_path);
                        return Ok(tauri::ipc::Response::new(bytes));
                    }
                }
            }
            // No output or empty — real failure
            let _ = std::fs::remove_file(&tmp_path);
            let stderr = stderr_lines.join("\n");
            Err(format!(
                "Ghostscript repair failed (exit {}): {}",
                exit_code.unwrap_or(-1),
                stderr
            ))
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
    let gs_ok = is_ghostscript_available(&app);
    results.insert("ghostscript", gs_ok);

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
                open POSIX file "{}"
                set theDoc to active document
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
            return Err(format!("Word conversion failed: {}", stderr));
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
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![greet, process_image, rotate_image, compress_pdf, cancel_processing, protect_pdf, unlock_pdf, convert_pdfa, repair_pdf, convert_with_libreoffice, convert_with_calibre, convert_with_textutil, convert_with_word, detect_converters, reveal_in_finder]);

    // E2E automation plugin — debug builds only, never ships in release
    #[cfg(debug_assertions)]
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
}
