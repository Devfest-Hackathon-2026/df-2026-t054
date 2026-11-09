// 板書の行を 1280x720 の PNG に描く: swift render-board.swift out.png "行1" "行2" ...
import AppKit

let args = CommandLine.arguments
let out = args[1]
let lines = Array(args.dropFirst(2))
let (w, h) = (1280, 720)

let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: w, pixelsHigh: h, bitsPerSample: 8,
                           samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
                           colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
NSColor(calibratedRed: 0.97, green: 0.97, blue: 0.95, alpha: 1).setFill()
NSRect(x: 0, y: 0, width: w, height: h).fill()

let font = NSFont(name: "Hiragino Sans W4", size: 40) ?? NSFont.systemFont(ofSize: 40)
let attrs: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: NSColor(calibratedWhite: 0.1, alpha: 1)]
for (i, line) in lines.enumerated() {
  let y = CGFloat(h) - 90 - CGFloat(i) * 80
  (line as NSString).draw(at: NSPoint(x: 80, y: y), withAttributes: attrs)
}
NSGraphicsContext.restoreGraphicsState()
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: out))
