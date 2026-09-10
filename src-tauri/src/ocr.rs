//! OCR for scanned PDFs, using the OS.
//!
//! Runs on Apple's Vision framework rather than a bundled engine. Tesseract
//! would mean shipping ~10 dylibs once leptonica and the image libraries are
//! counted, plus ~4 MB of language data per language and a P012 provenance
//! entry for each — and this project already has three placeholder Ghostscript
//! sidecars showing how that tends to end. Vision needs no binary, no language
//! data and no provenance, and covers 30 languages including the German and
//! Turkish that F13b targets.
//!
//! Rasterisation uses PDFKit rather than Ghostscript, so OCR does not inherit
//! the dependency that is missing on three of four platforms.
//!
//! This module only *reads* text and where it sits. Building the searchable PDF
//! is done with pdf-lib on the TypeScript side, where the rest of this app's PDF
//! writing already lives.

use serde::{Deserialize, Serialize};

/// One recognised run of text, positioned in PDF user space (points, origin at
/// the bottom-left) so the caller can place invisible text directly over it.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct OcrBlock {
    pub text: String,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    /// Vision's own confidence, 0.0–1.0. Carried through so the UI can be honest
    /// about a scan too poor to read rather than presenting guesses as fact.
    pub confidence: f32,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct OcrPage {
    pub index: usize,
    /// Page size in points, so the text layer lands on the right page geometry.
    pub width: f64,
    pub height: f64,
    pub blocks: Vec<OcrBlock>,
}

#[cfg_attr(target_os = "macos", allow(dead_code))]
pub const NO_ENGINE: &str = "Text recognition is only available on macOS for now.";

/// How much larger than PDF user space to rasterise before recognition.
/// A PDF point is 1/72 inch, so 3x is ~216 dpi — comfortably inside the range
/// Vision reads well, without the memory cost of 300 dpi on a long document.
#[cfg(target_os = "macos")]
const RENDER_SCALE: f64 = 3.0;

#[cfg(target_os = "macos")]
mod imp {
    use super::{OcrBlock, OcrPage, RENDER_SCALE};
    use objc2::rc::Retained;
    use objc2::AnyThread;
    use objc2_core_foundation::CFRetained;
    use objc2_core_foundation::{CGPoint, CGRect, CGSize};
    use objc2_core_graphics::{
        CGBitmapContextCreate, CGBitmapContextCreateImage, CGColorSpace, CGContext, CGImage,
        CGImageAlphaInfo, CGImageByteOrderInfo,
    };
    use objc2_foundation::{NSArray, NSDictionary, NSString, NSURL};
    use objc2_pdf_kit::{PDFDisplayBox, PDFDocument, PDFPage};
    use objc2_vision::{
        VNImageRequestHandler, VNRecognizeTextRequest, VNRecognizedTextObservation, VNRequest,
        VNRequestTextRecognitionLevel,
    };

    /// Renders one PDF page to a bitmap at RENDER_SCALE.
    fn render_page(page: &PDFPage, width_pt: f64, height_pt: f64) -> Result<CFRetained<CGImage>, String> {
        let px_w = (width_pt * RENDER_SCALE).round() as usize;
        let px_h = (height_pt * RENDER_SCALE).round() as usize;
        if px_w == 0 || px_h == 0 {
            return Err("This page reports no size.".to_string());
        }

        let color_space = CGColorSpace::new_device_rgb()
            .ok_or_else(|| "Could not create a colour space for rendering.".to_string())?;
        let bitmap_info = CGImageAlphaInfo::PremultipliedLast.0 | CGImageByteOrderInfo::Order32Big.0;

        // SAFETY: passing null lets Core Graphics own the buffer and free it with
        // the context. Nothing borrows it beyond the CGImage copied out below.
        let ctx = unsafe {
            CGBitmapContextCreate(
                std::ptr::null_mut(), px_w, px_h, 8, px_w * 4,
                Some(&color_space), bitmap_info,
            )
        }
        .ok_or_else(|| "Could not allocate a buffer for this page.".to_string())?;

        // A scanned page is opaque. Without this, anything the page does not
        // paint stays transparent and Vision reads text against black.
        CGContext::set_rgb_fill_color(Some(&ctx), 1.0, 1.0, 1.0, 1.0);
        CGContext::fill_rect(
            Some(&ctx),
            CGRect::new(CGPoint::new(0.0, 0.0), CGSize::new(px_w as f64, px_h as f64)),
        );
        CGContext::scale_ctm(Some(&ctx), RENDER_SCALE, RENDER_SCALE);

        // SAFETY: ctx is a live bitmap context sized for this page.
        unsafe { page.drawWithBox_toContext(PDFDisplayBox::MediaBox, &ctx) };

        CGBitmapContextCreateImage(Some(&ctx))
            .ok_or_else(|| "Could not read back the rendered page.".to_string())
    }

    /// Recognises text on a rendered page, converting Vision's normalised
    /// bottom-left boxes into PDF points on the same page.
    fn recognize_page(
        image: &CGImage,
        languages: &[String],
        width_pt: f64,
        height_pt: f64,
    ) -> Result<Vec<OcrBlock>, String> {
        let request = VNRecognizeTextRequest::new();
        request.setRecognitionLevel(VNRequestTextRecognitionLevel::Accurate);
        // Language correction turns plausible-looking nonsense into confident
        // nonsense on documents full of names and reference numbers — which is
        // exactly what this persona scans.
        request.setUsesLanguageCorrection(false);

        if !languages.is_empty() {
            let ns: Vec<Retained<NSString>> = languages.iter().map(|l| NSString::from_str(l)).collect();
            let refs: Vec<&NSString> = ns.iter().map(|s| &**s).collect();
            request.setRecognitionLanguages(&NSArray::from_slice(&refs));
        }

        let handler = unsafe {
            VNImageRequestHandler::initWithCGImage_options(
                VNImageRequestHandler::alloc(),
                image,
                &NSDictionary::new(),
            )
        };

        let as_request: &VNRequest = &request;
        let requests = NSArray::from_slice(&[as_request]);
        handler.performRequests_error(&requests)
            .map_err(|e| format!("Text recognition failed: {e}"))?;

        let mut blocks = Vec::new();
        if let Some(results) = request.results() {
            for observation in results.iter() {
                let Ok(text_obs) = observation.downcast::<VNRecognizedTextObservation>() else {
                    continue;
                };
                let candidates = text_obs.topCandidates(1);
                let Some(best) = candidates.iter().next() else { continue };

                // Vision reports normalised coordinates with the origin at the
                // bottom-left — the same convention PDF user space uses, so this
                // is a scale rather than a flip.
                let bbox = unsafe { text_obs.boundingBox() };
                blocks.push(OcrBlock {
                    text: best.string().to_string(),
                    x: bbox.origin.x * width_pt,
                    y: bbox.origin.y * height_pt,
                    width: bbox.size.width * width_pt,
                    height: bbox.size.height * height_pt,
                    confidence: best.confidence(),
                });
            }
        }
        Ok(blocks)
    }


    use objc2_core_foundation::{
        CFAttributedString, CFData, CFDictionary, CFMutableData, CFString, CFURL,
    };
    use objc2_core_graphics::{
        CGDataConsumer, CGPDFBox, CGPDFContextClose,
        CGPDFContextCreate, CGPDFDocument, CGPDFPage, CGTextDrawingMode,
    };
    use objc2_core_text::{kCTFontAttributeName, CTFont, CTLine};

    /// Lays invisible text over a copy of the source PDF.
    pub fn build_searchable_pdf(source_path: &str, pages: &[super::OcrPage]) -> Result<Vec<u8>, String> {
        super::check_readable(source_path)?;

        // SAFETY: the byte slice is a valid POSIX path for the lifetime of the call.
        let url = unsafe {
            CFURL::from_file_system_representation(
                None,
                source_path.as_ptr(),
                source_path.len() as isize,
                false,
            )
        }
        .ok_or_else(|| "This PDF path could not be read.".to_string())?;
        let source = CGPDFDocument::with_url(Some(&url))
            .ok_or_else(|| "This PDF could not be opened.".to_string())?;

        let data = CFMutableData::new(None, 0)
            .ok_or_else(|| "Could not allocate the output buffer.".to_string())?;
        let consumer = CGDataConsumer::with_cf_data(Some(&data))
            .ok_or_else(|| "Could not start writing the PDF.".to_string())?;
        // SAFETY: consumer outlives the context, which is dropped before `data`
        // is read back below.
        let ctx = unsafe { CGPDFContextCreate(Some(&consumer), std::ptr::null(), None) }
            .ok_or_else(|| "Could not create the output PDF.".to_string())?;

        let page_count = CGPDFDocument::number_of_pages(Some(&source));
        for index in 0..page_count {
            // CGPDFDocument pages are 1-based.
            let Some(src_page) = CGPDFDocument::page(Some(&source), index + 1) else { continue };
            let media = CGPDFPage::box_rect(Some(&src_page), CGPDFBox::MediaBox);

            let page_rect = media;
            // SAFETY: page_rect is a valid rect for the page being started.
            unsafe { CGContext::begin_page(Some(&ctx), &raw const page_rect) };
            CGContext::draw_pdf_page(Some(&ctx), Some(&src_page));

            if let Some(ocr) = pages.iter().find(|p| p.index == index) {
                draw_invisible_text(&ctx, ocr);
            }
            CGContext::end_page(Some(&ctx));
        }
        CGPDFContextClose(Some(&ctx));
        drop(ctx);

        Ok(CFData::to_vec(&data))
    }

    /// Draws each recognised block as invisible text at the position it was read
    /// from, sized so the run spans the box it came from — a text layer that does
    /// not line up selects the wrong words even though search still works.
    fn draw_invisible_text(ctx: &CGContext, page: &super::OcrPage) {
        CGContext::set_text_drawing_mode(Some(ctx), CGTextDrawingMode::Invisible);

        for block in &page.blocks {
            if block.text.trim().is_empty() || block.width <= 0.0 || block.height <= 0.0 {
                continue;
            }
            // Measure at a nominal size, then scale so the run matches the box.
            let nominal = 12.0_f64;
            let Some(line) = make_line(&block.text, nominal) else { continue };
            let measured = unsafe {
                line.typographic_bounds(std::ptr::null_mut(), std::ptr::null_mut(), std::ptr::null_mut())
            };
            if measured <= 0.0 {
                continue;
            }
            let size = (nominal * block.width / measured).clamp(1.0, 400.0);
            let Some(sized) = make_line(&block.text, size) else { continue };

            CGContext::set_text_position(Some(ctx), block.x, block.y);
            unsafe { sized.draw(ctx) };
        }
    }

    fn make_line(text: &str, size: f64) -> Option<objc2_core_foundation::CFRetained<CTLine>> {
        // Helvetica is a starting point, not a constraint: Core Text substitutes
        // per glyph, so Turkish, Greek, Cyrillic and CJK all render from whatever
        // system font covers them.
        let font = unsafe { CTFont::with_name(&CFString::from_str("Helvetica"), size, std::ptr::null()) };
        let mut keys = [unsafe { kCTFontAttributeName } as *const _ as *const std::ffi::c_void];
        let mut values = [&*font as *const _ as *const std::ffi::c_void];
        // SAFETY: one key/value pair, both alive for the duration of the call.
        let attrs = unsafe {
            CFDictionary::new(
                None,
                keys.as_mut_ptr(),
                values.as_mut_ptr(),
                1,
                std::ptr::null(),
                std::ptr::null(),
            )
        }?;
        // SAFETY: string and attributes both outlive the call.
        let attributed = unsafe {
            CFAttributedString::new(None, Some(&CFString::from_str(text)), Some(&attrs))
        }?;
        Some(unsafe { CTLine::with_attributed_string(&attributed) })
    }

    /// Every language this machine's Vision can recognise.
    ///
    /// Asked at runtime rather than hardcoded: the set grows between macOS
    /// releases, and a hardcoded list would either offer a language the OS cannot
    /// do or hide one it can. Returned as BCP-47 tags for the UI to name.
    pub fn supported_languages() -> Result<Vec<String>, String> {
        let request = VNRecognizeTextRequest::new();
        request.setRecognitionLevel(VNRequestTextRecognitionLevel::Accurate);
        let langs = unsafe { request.supportedRecognitionLanguagesAndReturnError() }
            .map_err(|e| format!("Could not read the supported languages: {e}"))?;
        Ok(langs.iter().map(|l| l.to_string()).collect())
    }

    /// Reads whatever text layer a PDF already carries.
    #[cfg(test)]
    pub fn extract_text(path: &str) -> Result<String, String> {
        let url = NSURL::fileURLWithPath(&NSString::from_str(path));
        let document = unsafe { PDFDocument::initWithURL(PDFDocument::alloc(), &url) }
            .ok_or_else(|| "This PDF could not be opened.".to_string())?;
        Ok(unsafe { document.string() }.map(|s| s.to_string()).unwrap_or_default())
    }

    /// Reads every page of a PDF. `on_page` fires before each page so a long
    /// document reports progress instead of appearing to hang.
    pub fn recognize_pdf(
        path: &str,
        languages: &[String],
        mut on_page: impl FnMut(usize, usize),
    ) -> Result<Vec<OcrPage>, String> {
        super::check_readable(path)?;

        let url = NSURL::fileURLWithPath(&NSString::from_str(path));
        let document = unsafe { PDFDocument::initWithURL(PDFDocument::alloc(), &url) }
            .ok_or_else(|| "This PDF could not be opened.".to_string())?;

        let page_count = unsafe { document.pageCount() };
        if page_count == 0 {
            return Err("This PDF has no pages.".to_string());
        }

        let mut pages = Vec::with_capacity(page_count);
        for index in 0..page_count {
            on_page(index, page_count);

            let Some(page) = (unsafe { document.pageAtIndex(index) }) else { continue };
            let bounds = unsafe { page.boundsForBox(PDFDisplayBox::MediaBox) };
            let (w, h) = (bounds.size.width, bounds.size.height);

            let image = render_page(&page, w, h)?;
            let blocks = recognize_page(&image, languages, w, h)?;
            pages.push(OcrPage { index, width: w, height: h, blocks });
        }
        Ok(pages)
    }
}

#[cfg(not(target_os = "macos"))]
mod imp {
    use super::OcrPage;
    pub fn recognize_pdf(
        _path: &str,
        _languages: &[String],
        _on_page: impl FnMut(usize, usize),
    ) -> Result<Vec<OcrPage>, String> {
        Err(super::NO_ENGINE.to_string())
    }
}

/// Establishes *why* a file cannot be used, before PDFKit flattens the reason.
///
/// `PDFDocument(url:)` and `CGPDFDocument(url:)` both report every failure the
/// same way — a nil document — so a missing file, a file this process may not
/// read, and a genuinely corrupt PDF were indistinguishable. The single message
/// they produced pointed the user at the Repair PDF tool, which can only help
/// with the last of the three.
///
/// Found while running REL-03: a structurally valid, byte-readable PDF sitting
/// on an iCloud-synced Desktop failed to open while the machine was offline, and
/// the app blamed the document.
///
/// One `open` syscall buys the distinction.
///
/// macOS-only because its only callers are: the platforms without a Vision
/// engine return NO_ENGINE before any file is touched, so an ungated definition
/// is dead code there — and `clippy -D warnings` is right to say so.
#[cfg(target_os = "macos")]
fn check_readable(path: &str) -> Result<(), String> {
    use std::io::ErrorKind;
    match std::fs::File::open(path) {
        Ok(_) => Ok(()),
        Err(e) => Err(match e.kind() {
            ErrorKind::NotFound => "This file could not be found. It may have been moved, renamed or deleted.".to_string(),
            ErrorKind::PermissionDenied => "PaperOtter is not allowed to read this file. Check its permissions, or move it somewhere PaperOtter can reach.".to_string(),
            // ETIMEDOUT on a local path means a file provider — iCloud Drive is
            // the common one — never answered. Naming it saves the user from
            // hunting a fault in the document.
            ErrorKind::TimedOut => "This file could not be read in time. If it is stored in iCloud Drive or another cloud folder, it may not be downloaded to this Mac yet.".to_string(),
            _ => format!("This file could not be read: {e}"),
        }),
    }
}

pub use imp::recognize_pdf;

// ─── Searchable output ───────────────────────────────────────────────────────

/// Reads whatever text layer a PDF already has.
///
/// Used to prove that the layer written by build_searchable_pdf is genuinely
/// extractable — read back through PDFKit, a different API than wrote it, rather
/// than trusting that the drawing calls did what they claimed.
#[cfg(all(target_os = "macos", test))]
pub fn extract_text(path: &str) -> Result<String, String> {
    imp::extract_text(path)
}

/// Every language this build can recognise, as BCP-47 tags.
#[cfg(target_os = "macos")]
pub fn supported_languages() -> Result<Vec<String>, String> {
    imp::supported_languages()
}

#[cfg(not(target_os = "macos"))]
pub fn supported_languages() -> Result<Vec<String>, String> {
    Ok(Vec::new())
}

/// Writes a copy of the PDF with an invisible text layer over each page.
///
/// Built with Core Graphics rather than pdf-lib, which is what the rest of this
/// app writes PDFs with. pdf-lib's standard fonts are WinAnsi and cannot encode
/// Turkish — `Ş` throws — so a searchable layer would need an embedded Unicode
/// font, meaning a new dependency and a font asset that would still only cover
/// the Latin half of the 30 languages Vision reads. macOS system fonts cover all
/// of them, with Core Text falling back automatically per glyph.
///
/// The page content is drawn as a PDF page, not rasterised, so images and vectors
/// survive at full quality. What does not survive is non-visual structure —
/// bookmarks, form fields, tagging. On a scanned document, the only input where
/// OCR makes sense, there is none.
#[cfg(target_os = "macos")]
pub fn build_searchable_pdf(source_path: &str, pages: &[OcrPage]) -> Result<Vec<u8>, String> {
    imp::build_searchable_pdf(source_path, pages)
}

#[cfg(not(target_os = "macos"))]
pub fn build_searchable_pdf(_source_path: &str, _pages: &[OcrPage]) -> Result<Vec<u8>, String> {
    Err(NO_ENGINE.to_string())
}
