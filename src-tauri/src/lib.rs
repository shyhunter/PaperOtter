// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use tauri::ipc::Response;
use tauri_plugin_shell::ShellExt;
use image::codecs::jpeg::JpegEncoder;
use image::codecs::png::{PngEncoder, CompressionType};
use std::io::Cursor;

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet, process_image])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
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
}
