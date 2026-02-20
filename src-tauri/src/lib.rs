// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use tauri::ipc::Response;
use image::codecs::jpeg::JpegEncoder;
use image::codecs::png::{PngEncoder, CompressionType};
use std::io::Cursor;

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
    // Read source bytes — runs with full OS permissions, bypasses capability sandbox
    let source_bytes = std::fs::read(&source_path)
        .map_err(|e| format!("Failed to read file: {}", e))?;

    // Decode image
    let mut img = image::load_from_memory(&source_bytes)
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

    match output_format.as_str() {
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
            // Map quality (1-100) to PNG compression level (0-9)
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

    Ok(Response::new(output_buf))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet, process_image])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
