// Lit le texte d'une capture d'écran et l'écrit ligne par ligne, de haut en bas.
// Sert à vérifier, dans le journal de compilation, ce que l'app affiche dans le simulateur.
// macOS uniquement :
//   swift scripts/ocr.swift capture.png

import AppKit
import Foundation
import Vision

guard CommandLine.arguments.count > 1 else {
    print("usage : swift ocr.swift image.png")
    exit(2)
}

let path = CommandLine.arguments[1]
guard let image = NSImage(contentsOfFile: path),
      let bitmap = image.cgImage(forProposedRect: nil, context: nil, hints: nil)
else {
    print("image illisible : \(path)")
    exit(1)
}

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.recognitionLanguages = ["fr-FR", "en-US"]

do {
    try VNImageRequestHandler(cgImage: bitmap, options: [:]).perform([request])
} catch {
    print("lecture impossible : \(error.localizedDescription)")
    exit(1)
}

let lines = (request.results ?? []).compactMap { observation -> (y: CGFloat, x: CGFloat, text: String)? in
    guard let candidate = observation.topCandidates(1).first else { return nil }
    return (1 - observation.boundingBox.midY, observation.boundingBox.minX, candidate.string)
}

print("\(bitmap.width) x \(bitmap.height) points, \(lines.count) lignes de texte")
for line in lines.sorted(by: { $0.y < $1.y }) {
    print(String(format: "haut %3.0f %%  gauche %3.0f %%  %@", line.y * 100, line.x * 100, line.text))
}
