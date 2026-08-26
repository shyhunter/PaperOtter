// Generates an image-only ("scanned") PDF fixture for OCR tests. macOS only.
//
//   swift scripts/generate_scanned_pdf_fixture.swift
//
// Produces test-fixtures/scanned.pdf — two A4 pages, each a rasterised image of
// known text with NO text layer, which is what a phone photo or flatbed scan of
// a document actually looks like. The known wording is what lets an OCR test
// assert on the result instead of merely checking that something came back.
import Foundation
import CoreGraphics
import CoreText
import AppKit

let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let out = root.appendingPathComponent("test-fixtures/scanned.pdf")

// A4 at 150 dpi — a realistic scan resolution.
let pageW = 1240, pageH = 1754
let lines = [
  ["RESIDENCE PERMIT APPLICATION", "Surname: MUSTERMANN", "Given name: ERIKA",
   "Date of birth: 12 August 1979", "Nationality: GERMAN"],
  ["Reference number: AZ 2026 004471", "Issued at: BERLIN",
   "This document was produced for testing.", "Page two of two."],
]

func renderPage(_ text: [String]) -> CGImage {
    let cs = CGColorSpaceCreateDeviceRGB()
    let ctx = CGContext(data: nil, width: pageW, height: pageH, bitsPerComponent: 8,
                        bytesPerRow: 0, space: cs,
                        bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
    ctx.setFillColor(red: 1, green: 1, blue: 1, alpha: 1)
    ctx.fill(CGRect(x: 0, y: 0, width: pageW, height: pageH))

    let font = CTFontCreateWithName("Helvetica" as CFString, 44, nil)
    var y = pageH - 220
    for line in text {
        let attrs: [NSAttributedString.Key: Any] = [
            .font: font, .foregroundColor: NSColor.black.cgColor,
        ]
        let attributed = NSAttributedString(string: line, attributes: attrs)
        let ctLine = CTLineCreateWithAttributedString(attributed)
        ctx.textPosition = CGPoint(x: 120, y: CGFloat(y))
        CTLineDraw(ctLine, ctx)
        y -= 90
    }
    return ctx.makeImage()!
}

var mediaBox = CGRect(x: 0, y: 0, width: 595, height: 842)   // A4 in points
guard let pdf = CGContext(out as CFURL, mediaBox: &mediaBox, nil) else {
    FileHandle.standardError.write("cannot create pdf\n".data(using: .utf8)!); exit(1)
}
for page in lines {
    pdf.beginPDFPage(nil)
    pdf.draw(renderPage(page), in: mediaBox)   // image fills the page: no text layer
    pdf.endPDFPage()
}
pdf.closePDF()
print("wrote \(out.lastPathComponent)")
