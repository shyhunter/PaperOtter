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

use serde::Serialize;

/// One recognised run of text, positioned in PDF user space (points, origin at
/// the bottom-left) so the caller can place invisible text directly over it.
#[derive(Serialize, Clone, Debug)]
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

#[derive(Serialize, Clone, Debug)]
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

    /// Reads every page of a PDF. `on_page` fires before each page so a long
    /// document reports progress instead of appearing to hang.
    pub fn recognize_pdf(
        path: &str,
        languages: &[String],
        mut on_page: impl FnMut(usize, usize),
    ) -> Result<Vec<OcrPage>, String> {
        let url = NSURL::fileURLWithPath(&NSString::from_str(path));
        let document = unsafe { PDFDocument::initWithURL(PDFDocument::alloc(), &url) }
            .ok_or_else(|| "This PDF could not be opened.".to_string())?;

        let page_count = unsafe { document.pageCount() } as usize;
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

pub use imp::recognize_pdf;
