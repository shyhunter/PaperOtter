//! Shrinking a PDF by shrinking the images inside it.
//!
//! This replaced Ghostscript, and it is deliberately narrower than Ghostscript
//! was. Measured on the project's own fixtures, `gs -dPDFSETTINGS` did three
//! things: it shrank documents whose images were larger than the preset wanted,
//! it left already-optimal documents alone, and it **inflated text-only
//! documents by two to three times** while reporting success. Only the first is
//! worth reproducing.
//!
//! What the measurements settled, on `test-fixtures/scanned.pdf`:
//!
//! * **Downsampling is the lever.** Re-encoding at the same pixel size saved 6%.
//!   Downsampling and re-encoding saved 68%.
//! * **The two are inseparable.** Downsampling without re-encoding produced a
//!   file **25 times larger** than the original, because resizing yields raw
//!   samples that something then has to compress.
//! * **Neither encoder always wins.** On two images from the same scan, JPEG beat
//!   Flate by 2% on one and lost to it by 7% on the other. So both are tried and
//!   the smaller is kept, which costs one extra encode and is never worse.
//! * Ghostscript's `/screen` sits near JPEG quality 40.
//!
//! Two promises this makes that Ghostscript did not: a page's content is only
//! ever replaced when the replacement is **smaller**, and the whole document is
//! only returned when it is **smaller than what came in**. A compressor that
//! hands back something bigger has failed, whatever its exit code said.
use std::io::Write;
use std::sync::atomic::{AtomicBool, Ordering};

use flate2::{write::ZlibEncoder, Compression};
use image::{DynamicImage, GrayImage, RgbImage};
use qpdf::{QPdf, QPdfDictionary, QPdfObjectLike, QPdfScalar, QPdfStream, StreamDecodeLevel};

/// Returned when the caller asked to stop between images.
pub const CANCELLED: &str = "CANCELLED";

/// What each quality level asks for, in the units the work actually happens in.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Preset {
    /// Images above this resolution get scaled down to it.
    pub target_dpi: f32,
    /// JPEG quality to try. `None` means never re-encode lossily.
    pub jpeg_quality: Option<u8>,
}

impl Preset {
    pub fn from_name(name: &str) -> Result<Self, String> {
        Ok(match name {
            // Calibrated against gs 10.06's own output rather than guessed: at
            // quality 40 this lands within about a tenth of what /screen
            // produced on the same fixture.
            "screen" => Preset { target_dpi: 72.0, jpeg_quality: Some(40) },
            "ebook" => Preset { target_dpi: 150.0, jpeg_quality: Some(60) },
            "printer" => Preset { target_dpi: 300.0, jpeg_quality: Some(75) },
            // Archive quality: resolution is kept and nothing is thrown away, so
            // the only saving available is a better lossless encode.
            "prepress" => Preset { target_dpi: 300.0, jpeg_quality: None },
            other => return Err(format!("Unknown quality preset '{other}'.")),
        })
    }
}

/// One image found in the document, with everything needed to decide about it.
struct Candidate {
    stream: QPdfStream,
    width: u32,
    height: u32,
    components: u32,
    stored_bytes: usize,
    /// Width of the page it sits on, in points.
    page_width_pt: f32,
}

/// Compress `source`. Returns the original bytes when nothing could be improved.
pub fn compress(
    source: &[u8],
    preset: Preset,
    downsample: bool,
    cancel: &AtomicBool,
    mut on_progress: impl FnMut(usize, usize),
) -> Result<Vec<u8>, String> {
    let pdf = QPdf::read_from_memory(source)
        .map_err(|e| format!("Could not read the PDF: {}", first_line(&e.to_string())))?;

    let candidates = collect_images(&pdf)?;
    let total = candidates.len();

    // A document with no images has nothing this can improve. Returning the
    // input untouched is the honest answer, and it is already better than
    // Ghostscript managed -- it grew these files by two to three times.
    if total == 0 {
        return Ok(source.to_vec());
    }

    let mut changed = false;
    for (index, candidate) in candidates.into_iter().enumerate() {
        if cancel.load(Ordering::Relaxed) {
            return Err(CANCELLED.to_string());
        }
        on_progress(index + 1, total);
        if shrink_one(&pdf, &candidate, preset, downsample)? {
            changed = true;
        }
    }

    if !changed {
        return Ok(source.to_vec());
    }

    let out = pdf
        .writer()
        .object_stream_mode(qpdf::ObjectStreamMode::Generate)
        .compress_streams(true)
        .write_to_memory()
        .map_err(|e| format!("Could not write the PDF: {}", first_line(&e.to_string())))?;

    // The last guard, and the one Ghostscript never had: a compressor that
    // returns something larger has not compressed anything, so hand back what
    // it was given.
    Ok(if out.len() < source.len() { out } else { source.to_vec() })
}

fn first_line(s: &str) -> String {
    s.lines().next().unwrap_or(s).trim().to_string()
}

/// Every image XObject in the document that is safe to touch.
fn collect_images(pdf: &QPdf) -> Result<Vec<Candidate>, String> {
    let mut found = Vec::new();
    let pages = pdf.get_pages().map_err(|e| first_line(&e.to_string()))?;

    for page in pages {
        let page_width_pt = media_box_width(&page).unwrap_or(612.0);
        let Some(resources) = page.get("/Resources") else { continue };
        let resources: QPdfDictionary = resources.into();
        let Some(xobjects) = resources.get("/XObject") else { continue };
        let xobjects: QPdfDictionary = xobjects.into();

        for key in xobjects.keys() {
            let Some(object) = xobjects.get(&key) else { continue };
            if object.get_type() != qpdf::QPdfObjectType::Stream {
                continue;
            }
            let stream: QPdfStream = object.into();
            let dict = stream.get_dictionary();
            if name_of(&dict, "/Subtype") != "/Image" {
                continue;
            }

            // Left alone on purpose:
            //  * an /SMask carries transparency, and JPEG cannot hold an alpha
            //    channel, so re-encoding one silently flattens it;
            //  * an /ImageMask is a 1-bit stencil, where resampling produces
            //    grey values the format cannot represent;
            //  * anything not 8 bits per component is outside what the decode
            //    below assumes, and guessing at it would corrupt the page.
            if dict.has("/SMask") || dict.has("/Mask") || dict.has("/ImageMask") {
                continue;
            }
            if int_of(&dict, "/BitsPerComponent") != 8 {
                continue;
            }

            let width = int_of(&dict, "/Width") as u32;
            let height = int_of(&dict, "/Height") as u32;
            if width == 0 || height == 0 {
                continue;
            }

            let Ok(decoded) = stream.get_data(StreamDecodeLevel::Specialized) else { continue };

            // The component count has to come out exactly, and dividing for it
            // is not enough. qpdf's specialized decode level leaves /DCTDecode
            // and /JPXDecode encoded, so for those streams this is the image
            // *file*, not its samples -- and a file small enough divides by its
            // own pixel count to a perfectly plausible 1 or 3 once integer
            // division has dropped the remainder. A 15x15 JPEG of 333 bytes
            // read as grey, and the encoder downstream asserts on the length it
            // is handed. An exact fit is what separates samples from a picture
            // that merely happens to be about the right size.
            let pixels = width as usize * height as usize;
            let components = match decoded.as_ref().len() {
                n if n == pixels => 1,
                n if n == pixels * 3 => 3,
                // CMYK, exotic colour spaces, and anything still encoded.
                _ => continue,
            };

            let stored_bytes = stream
                .get_data(StreamDecodeLevel::None)
                .map(|d| d.as_ref().len())
                .unwrap_or(usize::MAX);

            found.push(Candidate { stream, width, height, components, stored_bytes, page_width_pt });
        }
    }
    Ok(found)
}

/// Try to improve one image. Returns whether it was actually replaced.
fn shrink_one(
    pdf: &QPdf,
    candidate: &Candidate,
    preset: Preset,
    downsample: bool,
) -> Result<bool, String> {
    let raw = candidate
        .stream
        .get_data(StreamDecodeLevel::Specialized)
        .map_err(|e| first_line(&e.to_string()))?;

    // `from_raw` below accepts any buffer that is merely *long enough* and
    // keeps the surplus, which is how extra bytes reach an encoder that asserts
    // on length. The candidate was measured exactly, so a mismatch here means
    // the stream is not what it was when it was collected.
    let expected = candidate.width as usize * candidate.height as usize * candidate.components as usize;
    if raw.as_ref().len() != expected {
        return Ok(false);
    }

    let image = match candidate.components {
        1 => GrayImage::from_raw(candidate.width, candidate.height, raw.as_ref().to_vec())
            .map(DynamicImage::ImageLuma8),
        _ => RgbImage::from_raw(candidate.width, candidate.height, raw.as_ref().to_vec())
            .map(DynamicImage::ImageRgb8),
    };
    let Some(image) = image else { return Ok(false) };

    // How many pixels the image spends per inch of page.
    //
    // Taken from the page width rather than from the placement matrix, which
    // would mean walking the content stream. The approximation errs the safe
    // way: an image occupying only part of the page has a *higher* true
    // resolution than this reports, so it is downsampled less than it could be
    // — a missed saving rather than a damaged picture.
    let page_inches = candidate.page_width_pt / 72.0;
    let effective_dpi = if page_inches > 0.0 { candidate.width as f32 / page_inches } else { 0.0 };

    let image = if downsample && effective_dpi > preset.target_dpi * 1.05 {
        let scale = preset.target_dpi / effective_dpi;
        let w = ((candidate.width as f32 * scale).round() as u32).max(1);
        let h = ((candidate.height as f32 * scale).round() as u32).max(1);
        image.resize_exact(w, h, image::imageops::FilterType::Lanczos3)
    } else {
        image
    };

    let (w, h) = (image.width(), image.height());

    // A great many scans are grey pictures stored in three identical channels,
    // and paying three times for one is the single largest saving available
    // here. Measured on `scanned.pdf`, whose channels are *exactly* equal:
    // 22,375 bytes as RGB against 14,130 as grey, at the same quality.
    //
    // The tolerance depends on what the preset already permits. A lossy preset
    // is discarding more than a couple of levels regardless, so a scan carrying
    // faint JPEG noise still counts as grey. An archival preset throws nothing
    // away, so only exactly-equal channels qualify — a sepia tint, which reads
    // as near-grey, must survive there.
    let tolerance = if preset.jpeg_quality.is_some() { 4 } else { 0 };
    let gray = candidate.components == 1 || carries_no_colour(&image, tolerance);

    let mut best: Option<(Vec<u8>, &'static str)> = None;
    let mut consider = |bytes: Vec<u8>, filter: &'static str| {
        if best.as_ref().is_none_or(|(b, _)| bytes.len() < b.len()) {
            best = Some((bytes, filter));
        }
    };

    // Lossless, always available.
    let samples = if gray { image.to_luma8().into_raw() } else { image.to_rgb8().into_raw() };
    let mut encoder = ZlibEncoder::new(Vec::new(), Compression::best());
    encoder.write_all(&samples).map_err(|e| e.to_string())?;
    consider(encoder.finish().map_err(|e| e.to_string())?, "/FlateDecode");

    // Lossy, where the preset allows it.
    if let Some(quality) = preset.jpeg_quality {
        let mut buffer = Vec::new();
        let colour = if gray {
            image::ExtendedColorType::L8
        } else {
            image::ExtendedColorType::Rgb8
        };
        let mut jpeg = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut buffer, quality);
        if jpeg.encode(&samples, w, h, colour).is_ok() {
            consider(buffer, "/DCTDecode");
        }
    }

    let Some((bytes, filter)) = best else { return Ok(false) };

    // Per-image guard: never make a picture bigger than it already was.
    if bytes.len() >= candidate.stored_bytes {
        return Ok(false);
    }

    candidate.stream.replace_data(&bytes, pdf.new_name(filter), pdf.new_null());

    let dict = candidate.stream.get_dictionary();
    dict.set("/Width", pdf.new_integer(w as i64));
    dict.set("/Height", pdf.new_integer(h as i64));
    dict.set("/BitsPerComponent", pdf.new_integer(8));
    dict.set(
        "/ColorSpace",
        pdf.new_name(if gray { "/DeviceGray" } else { "/DeviceRGB" }),
    );
    // The old parameters described the old bytes. Leaving them behind is how a
    // reader ends up applying a predictor to data that no longer has one.
    dict.remove("/DecodeParms");

    Ok(true)
}

/// Whether every pixel's channels are close enough to call this grey.
///
/// Every pixel is examined rather than a sample: one coloured stamp on an
/// otherwise grey page is exactly the case that must keep its colour, and a
/// sampler would miss it.
fn carries_no_colour(image: &DynamicImage, tolerance: u8) -> bool {
    image.to_rgb8().pixels().all(|p| {
        let (r, g, b) = (p[0], p[1], p[2]);
        r.max(g).max(b) - r.min(g).min(b) <= tolerance
    })
}

fn media_box_width(page: &QPdfDictionary) -> Option<f32> {
    let media = page.get("/MediaBox")?;
    let array: qpdf::QPdfArray = media.into();
    if array.len() < 4 {
        return None;
    }
    let x0 = QPdfScalar::from(array.get(0)?).as_f64() as f32;
    let x1 = QPdfScalar::from(array.get(2)?).as_f64() as f32;
    Some((x1 - x0).abs())
}

fn name_of(dict: &QPdfDictionary, key: &str) -> String {
    dict.get(key).map(|v| v.as_name()).unwrap_or_default()
}

fn int_of(dict: &QPdfDictionary, key: &str) -> i64 {
    dict.get(key).map(|v| QPdfScalar::from(v).as_i64()).unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    fn fixture(name: &str) -> Vec<u8> {
        let p = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap().join("test-fixtures").join(name);
        std::fs::read(p).unwrap_or_else(|e| panic!("{name}: {e}"))
    }

    fn run(name: &str, preset: &str) -> (Vec<u8>, Vec<u8>) {
        let src = fixture(name);
        let out = compress(&src, Preset::from_name(preset).unwrap(), true, &AtomicBool::new(false), |_, _| {})
            .unwrap_or_else(|e| panic!("{name}/{preset}: {e}"));
        (src, out)
    }

    fn pages(bytes: &[u8]) -> u32 {
        QPdf::read_from_memory(bytes).unwrap().get_num_pages().unwrap()
    }

    #[test]
    fn compress_01_shrinks_an_oversized_scan() {
        let (src, out) = run("scanned.pdf", "screen");
        // Ghostscript's /screen produced 40,366 bytes from this same 127,220-byte
        // file. The agreed bar was "within 15% of that"; it is set at Ghostscript's
        // own number instead, because this beats it — 29,326 bytes when written,
        // a 77% reduction against Ghostscript's 68%.
        //
        // The difference is one thing Ghostscript did not do here: these scans are
        // grey pictures stored in three identical channels, and dropping the two
        // redundant ones is worth about 37%. The bar is therefore "no worse than
        // what it replaced", with real headroom underneath it.
        const GHOSTSCRIPT_SCREEN: usize = 40_366;
        assert!(out.len() < src.len(), "expected a smaller file, got {} from {}", out.len(), src.len());
        assert!(
            out.len() <= GHOSTSCRIPT_SCREEN,
            "{} bytes is worse than the Ghostscript it replaced ({GHOSTSCRIPT_SCREEN})",
            out.len()
        );
        assert_eq!(pages(&out), pages(&src), "pages must survive compression");
    }

    #[test]
    fn compress_02_leaves_a_text_only_document_exactly_as_it_was() {
        // Ghostscript grew these by two to three times while reporting success.
        // Returning the input unchanged is both honest and strictly better.
        for name in ["sample.pdf", "warnock_camelot.pdf"] {
            let src = fixture(name);
            let out = compress(&src, Preset::from_name("screen").unwrap(), true, &AtomicBool::new(false), |_, _| {}).unwrap();
            assert_eq!(out, src, "{name} has no images and must come back byte-identical");
        }
    }

    #[test]
    fn compress_03_never_returns_a_bigger_file() {
        for name in ["sample.pdf", "photo_heavy.pdf", "scanned.pdf", "warnock_camelot.pdf"] {
            for preset in ["screen", "ebook", "printer", "prepress"] {
                let (src, out) = run(name, preset);
                assert!(out.len() <= src.len(), "{name}/{preset}: {} > {}", out.len(), src.len());
            }
        }
    }

    #[test]
    fn compress_04_an_already_optimal_document_is_left_alone() {
        // photo_heavy.pdf is one JPEG at 72 dpi shared by three pages: already at
        // the screen preset's target, so there is nothing to take away.
        let (src, out) = run("photo_heavy.pdf", "screen");
        assert_eq!(out, src, "nothing to gain, so nothing should change");
    }

    #[test]
    fn compress_05_prepress_never_re_encodes_lossily() {
        assert_eq!(Preset::from_name("prepress").unwrap().jpeg_quality, None);
        let (src, out) = run("scanned.pdf", "prepress");
        assert!(out.len() <= src.len());
    }

    #[test]
    fn compress_06_stops_when_asked_to() {
        let src = fixture("scanned.pdf");
        let cancel = AtomicBool::new(true);
        let err = compress(&src, Preset::from_name("screen").unwrap(), true, &cancel, |_, _| {}).unwrap_err();
        assert_eq!(err, CANCELLED);
    }

    #[test]
    fn compress_07_rejects_an_unknown_preset() {
        assert!(Preset::from_name("enormous").is_err());
    }

    /// A PDF holding one small JPEG, built here rather than checked in so the
    /// dimensions that trigger the bug are visible in the test.
    ///
    /// Returns the document and the length of the JPEG inside it.
    fn pdf_with_jpeg(w: u32, h: u32) -> (Vec<u8>, usize) {
        let picture = RgbImage::from_fn(w, h, |x, y| {
            image::Rgb([(x * 9) as u8, (y * 9) as u8, 0x40])
        });
        let mut jpeg = Vec::new();
        image::codecs::jpeg::JpegEncoder::new_with_quality(&mut jpeg, 80)
            .encode(picture.as_raw(), w, h, image::ExtendedColorType::Rgb8)
            .unwrap();

        let pdf = QPdf::empty();

        let image = pdf.new_stream([]);
        image.replace_data(&jpeg, pdf.new_name("/DCTDecode"), pdf.new_null());
        let dict = image.get_dictionary();
        dict.set("/Type", pdf.new_name("/XObject"));
        dict.set("/Subtype", pdf.new_name("/Image"));
        dict.set("/Width", pdf.new_integer(w as i64));
        dict.set("/Height", pdf.new_integer(h as i64));
        dict.set("/BitsPerComponent", pdf.new_integer(8));
        dict.set("/ColorSpace", pdf.new_name("/DeviceRGB"));
        drop(dict);

        let xobjects = pdf.new_dictionary();
        xobjects.set("/Im0", image.into_indirect());
        let resources = pdf.new_dictionary();
        resources.set("/XObject", &xobjects);

        let media = pdf.new_array_from(
            [0, 0, 200, 200].into_iter().map(|n| pdf.new_integer(n).into()),
        );

        let content = pdf.new_stream(b"q 150 0 0 150 20 20 cm /Im0 Do Q".to_vec());

        let page = pdf.new_dictionary();
        page.set("/Type", pdf.new_name("/Page"));
        page.set("/MediaBox", &media);
        page.set("/Resources", &resources);
        page.set("/Contents", content.into_indirect());
        pdf.add_page(page.into_indirect(), true).unwrap();

        (pdf.writer().write_to_memory().unwrap(), jpeg.len())
    }

    /// Regression: one small JPEG took the whole compressor down.
    ///
    /// qpdf's specialized decode level leaves /DCTDecode alone, so the bytes it
    /// hands back for such a stream are the JPEG file, not samples. The
    /// component count was inferred by dividing that length by the pixel count,
    /// and integer division does not mind dividing unevenly: a 15x15 JPEG of
    /// 333 bytes came out as "1 component", was accepted as 8-bit grey, and was
    /// passed to an encoder that asserts on buffer length. The assert fired
    /// inside a blocking task, so the user saw
    /// `Compression task failed: task 124 panicked with message "assertion
    /// `left == right` failed: Invalid buffer length: expected 225 got 333"`.
    #[test]
    fn compress_08_a_small_jpeg_is_not_mistaken_for_raw_samples() {
        let (src, jpeg_len) = pdf_with_jpeg(15, 15);

        // Without this the test proves nothing: the bug needs a JPEG at least as
        // long as its own pixel count, which is only true of very small images.
        assert!(jpeg_len >= 15 * 15, "{jpeg_len} bytes cannot reproduce the fault");

        for preset in ["screen", "ebook", "printer", "prepress"] {
            let out = compress(
                &src,
                Preset::from_name(preset).unwrap(),
                true,
                &AtomicBool::new(false),
                |_, _| {},
            )
            .unwrap_or_else(|e| panic!("{preset}: {e}"));
            assert_eq!(out, src, "{preset}: an encoded stream is not raw samples");
        }
    }
}
