//! HEIC/HEIF decoding.
//!
//! Every photo an iPhone takes is HEIC by default, so this is the first thing the
//! persona in `.planning/PROJECT.md` tries: photograph an ID, drag it in.
//!
//! Decoding runs on macOS Image I/O rather than a Rust crate. The pure-Rust
//! decoders on crates.io are AGPL-licensed, which an MIT app cannot take, and
//! libheif means shipping LGPL C libraries built for four targets. macOS ships a
//! decoder in the OS — the same one Preview and Finder use. Windows and Linux get
//! an honest error instead of a silent failure; `is_heic` and the error path are
//! compiled and tested everywhere, only the decode itself is macOS-only.

/// ISO-BMFF major brands that mean "this is a HEIF still image".
///
/// `mif1`/`msf1` are the generic HEIF brands; the rest are Apple's HEVC-coded
/// variants. Matching on the major brand alone is enough here because the file
/// extension has already been checked by the time we see the bytes.
const HEIC_BRANDS: [&[u8; 4]; 8] = [
    b"heic", b"heix", b"heim", b"heis", b"hevc", b"hevx", b"mif1", b"msf1",
];

/// Returns true if the bytes carry an `ftyp` box with a HEIF brand.
///
/// Deliberately total: a truncated or empty buffer is "not HEIC", never a panic.
/// This is the first thing that touches a user-supplied file.
pub fn is_heic(bytes: &[u8]) -> bool {
    if bytes.len() < 12 || &bytes[4..8] != b"ftyp" {
        return false;
    }
    let brand: &[u8; 4] = match bytes[8..12].try_into() {
        Ok(b) => b,
        Err(_) => return false,
    };
    HEIC_BRANDS.contains(&brand)
}

/// Message shown when the build has no HEIC decoder. Kept in one place because
/// it is asserted from the test suite on non-macOS targets.
#[cfg_attr(target_os = "macos", allow(dead_code))]
pub const NO_DECODER: &str =
    "HEIC photos can only be opened on macOS for now — convert it to JPEG first.";

#[cfg(target_os = "macos")]
mod imp {
    use objc2_core_foundation::{CFData, CFNumber, CFNumberType, CFString, CGPoint, CGRect, CGSize};
    use objc2_core_graphics::{
        CGBitmapContextCreate, CGColorSpace, CGContext, CGImage, CGImageAlphaInfo,
        CGImageByteOrderInfo,
    };
    use objc2_image_io::{kCGImagePropertyOrientation, CGImageSource};

    fn open(bytes: &[u8]) -> Result<objc2_core_foundation::CFRetained<CGImageSource>, String> {
        let data = CFData::from_bytes(bytes);
        // SAFETY: `data` outlives the call; no options dictionary is passed.
        unsafe { CGImageSource::with_data(&data, None) }
            .ok_or_else(|| "This HEIC photo could not be read — the file may be damaged.".to_string())
    }

    /// Number of images the container holds. A normal photo is 1; a burst or a
    /// multi-exposure capture can be more.
    pub fn frame_count(bytes: &[u8]) -> Result<usize, String> {
        let source = open(bytes)?;
        // SAFETY: `source` is a live CGImageSource.
        Ok(unsafe { source.count() })
    }

    /// Decodes the container's *primary* image — the one the `pitm` box names,
    /// which is what Preview shows and what the user photographed. Returns the
    /// image alongside the total frame count so the caller can say when it chose.
    pub fn decode(bytes: &[u8]) -> Result<(image::DynamicImage, usize), String> {
        let source = open(bytes)?;

        // SAFETY: `source` is a live CGImageSource for all three calls.
        let (count, primary) = unsafe { (source.count(), source.primary_image_index()) };
        if count == 0 {
            return Err("This HEIC file contains no images.".to_string());
        }
        let cg_image = unsafe { source.image_at_index(primary, None) }
            .ok_or_else(|| "This HEIC photo could not be decoded — the file may be damaged.".to_string())?;

        let orientation = exif_orientation(&source, primary);

        let width = CGImage::width(Some(&cg_image));
        let height = CGImage::height(Some(&cg_image));
        if width == 0 || height == 0 {
            return Err("This HEIC photo reports no size — the file may be damaged.".to_string());
        }
        // A 100 MB HEIC (the app's input ceiling) cannot legitimately exceed this,
        // and the multiplication below must not wrap on a hostile header.
        let pixels = width
            .checked_mul(height)
            .and_then(|p| p.checked_mul(4))
            .ok_or_else(|| "This HEIC photo is too large to open.".to_string())?;

        let color_space = CGColorSpace::new_device_rgb()
            .ok_or_else(|| "Could not create a colour space for decoding.".to_string())?;

        let mut buffer = vec![0u8; pixels];
        // PremultipliedLast puts alpha after the colour components: R,G,B,A in
        // memory, which is exactly what image::RgbaImage::from_raw expects. The
        // byte-order flag is stated rather than left to default so the layout the
        // buffer is read back as is written down at the point it is created.
        // Picking a *First variant instead silently yields ARGB — same length,
        // same dimensions, every channel shifted by one.
        let bitmap_info = CGImageAlphaInfo::PremultipliedLast.0 | CGImageByteOrderInfo::Order32Big.0;

        // SAFETY: buffer is `width * height * 4` bytes, matching the row stride and
        // dimensions passed here; it outlives the context, which is dropped below.
        let context = unsafe {
            CGBitmapContextCreate(
                buffer.as_mut_ptr().cast(),
                width,
                height,
                8,
                width * 4,
                Some(&color_space),
                bitmap_info,
            )
        }
        .ok_or_else(|| "Could not allocate a buffer for this HEIC photo.".to_string())?;

        CGContext::draw_image(
            Some(&context),
            CGRect::new(CGPoint::new(0.0, 0.0), CGSize::new(width as f64, height as f64)),
            Some(&cg_image),
        );
        drop(context);

        un_premultiply(&mut buffer);

        let rgba = image::RgbaImage::from_raw(width as u32, height as u32, buffer)
            .ok_or_else(|| "Decoded HEIC pixels did not match the reported size.".to_string())?;
        let img = apply_orientation(image::DynamicImage::ImageRgba8(rgba), orientation);
        Ok((img, count))
    }

    /// The EXIF orientation Image I/O reports, or 1 when there is none.
    ///
    /// Every iPhone stores its photos in a single sensor orientation and records
    /// the upright rotation as metadata. `image_at_index` returns the *stored*
    /// pixels and does not apply it — Preview and Finder do, which is precisely
    /// why an unrotated photo reads as this app's fault rather than the file's.
    ///
    /// A missing, unreadable or out-of-range value means "leave it alone": a
    /// photo shown as stored is wrong, but a photo mangled by a bad tag is worse.
    fn exif_orientation(source: &CGImageSource, index: usize) -> u32 {
        // SAFETY: `source` is a live CGImageSource, and the key is a static
        // CFString owned by Image I/O.
        let Some(props) = (unsafe { source.properties_at_index(index, None) }) else {
            return 1;
        };
        let key: *const core::ffi::c_void =
            (unsafe { kCGImagePropertyOrientation }) as *const CFString as *const _;
        // SAFETY: `props` is a live CFDictionary and `key` is a valid CFString.
        let value = unsafe { props.value(key) };
        if value.is_null() {
            return 1;
        }
        // SAFETY: kCGImagePropertyOrientation's value is documented as a CFNumber.
        let number = unsafe { &*(value as *const CFNumber) };
        let mut raw: i32 = 1;
        // SAFETY: `raw` is a live i32 matching the SInt32Type requested.
        let ok = unsafe {
            number.value(CFNumberType::SInt32Type, (&mut raw as *mut i32).cast())
        };
        if ok && (1..=8).contains(&raw) {
            raw as u32
        } else {
            1
        }
    }

    /// Turns stored pixels into what the photographer saw.
    ///
    /// The eight EXIF values are four rotations and their mirrors. The mirrored
    /// four are rare from a camera but arrive from screenshots and scanners, and
    /// costing nothing to support is better than being subtly wrong on them.
    fn apply_orientation(img: image::DynamicImage, orientation: u32) -> image::DynamicImage {
        match orientation {
            2 => img.fliph(),
            3 => img.rotate180(),
            4 => img.flipv(),
            5 => img.rotate90().fliph(),
            6 => img.rotate90(),
            7 => img.rotate270().fliph(),
            8 => img.rotate270(),
            _ => img,
        }
    }

    /// Core Graphics hands back premultiplied alpha; the `image` crate expects
    /// straight alpha. Photos are opaque so this is usually a no-op, but a HEIC
    /// with transparency would otherwise darken towards black at its soft edges.
    fn un_premultiply(buffer: &mut [u8]) {
        for px in buffer.chunks_exact_mut(4) {
            let a = px[3];
            if a == 0 || a == 255 {
                continue;
            }
            for c in &mut px[..3] {
                *c = ((*c as u16 * 255) / a as u16).min(255) as u8;
            }
        }
    }
}

#[cfg(not(target_os = "macos"))]
mod imp {
    pub fn frame_count(_bytes: &[u8]) -> Result<usize, String> {
        Err(super::NO_DECODER.to_string())
    }

    pub fn decode(_bytes: &[u8]) -> Result<(image::DynamicImage, usize), String> {
        Err(super::NO_DECODER.to_string())
    }
}

pub use imp::{decode, frame_count};
