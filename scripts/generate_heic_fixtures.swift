// Generates the HEIC test fixtures. macOS only — HEIC encoding needs Image I/O,
// and the Rust `image` crate used by tools/generate-fixtures cannot write HEIC.
//
//   swift scripts/generate_heic_fixtures.swift
//
// Produces:
//   test-fixtures/sample.heic        — single image, 300x200, converted from sample.jpg
//   test-fixtures/sample-multi.heic  — two frames: primary 120x80 red, secondary 60x40 blue
//
// The multi-frame fixture exists to pin two things that a single-frame file
// cannot: that decoding picks the *primary* frame rather than whichever comes
// last, and that the channel order survives (flat, saturated colours make an
// RGBA/ARGB mix-up visible, which matching dimensions alone would not catch).
import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let fixtures = root.appendingPathComponent("test-fixtures")

func solid(width: Int, height: Int, r: Double, g: Double, b: Double) -> CGImage {
    let ctx = CGContext(
        data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
        space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue
    )!
    ctx.setFillColor(red: r, green: g, blue: b, alpha: 1)
    ctx.fill(CGRect(x: 0, y: 0, width: width, height: height))
    return ctx.makeImage()!
}

func write(_ images: [CGImage], to url: URL) {
    guard let dest = CGImageDestinationCreateWithURL(
        url as CFURL, UTType.heic.identifier as CFString, images.count, nil
    ) else {
        FileHandle.standardError.write("cannot create \(url.lastPathComponent)\n".data(using: .utf8)!)
        exit(1)
    }
    // The first image added becomes the primary (pitm) image.
    for image in images { CGImageDestinationAddImage(dest, image, nil) }
    guard CGImageDestinationFinalize(dest) else {
        FileHandle.standardError.write("finalize failed for \(url.lastPathComponent)\n".data(using: .utf8)!)
        exit(1)
    }
    print("wrote \(url.lastPathComponent)")
}

// Single image: converted from the existing JPEG fixture so both describe the
// same 300x200 picture, which keeps the decode assertions comparable.
let jpegSource = fixtures.appendingPathComponent("sample.jpg")
guard let src = CGImageSourceCreateWithURL(jpegSource as CFURL, nil),
      let jpegImage = CGImageSourceCreateImageAtIndex(src, 0, nil) else {
    FileHandle.standardError.write("run this from the repo root — test-fixtures/sample.jpg not found\n".data(using: .utf8)!)
    exit(1)
}
write([jpegImage], to: fixtures.appendingPathComponent("sample.heic"))

write(
    [solid(width: 120, height: 80, r: 220/255, g: 40/255, b: 40/255),
     solid(width: 60, height: 40, r: 40/255, g: 90/255, b: 220/255)],
    to: fixtures.appendingPathComponent("sample-multi.heic")
)
