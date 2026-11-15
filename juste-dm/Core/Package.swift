// swift-tools-version:5.9
import PackageDescription

// Ce paquet sert uniquement à lancer les tests des règles de navigation avec `swift test`.
// L'app compile directement les fichiers de Sources/JusteDMCore.
let package = Package(
    name: "JusteDMCore",
    products: [
        .library(name: "JusteDMCore", targets: ["JusteDMCore"]),
    ],
    targets: [
        .target(name: "JusteDMCore"),
        .testTarget(name: "JusteDMCoreTests", dependencies: ["JusteDMCore"]),
    ]
)
