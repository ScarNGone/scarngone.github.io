import Foundation
import WebKit

/// Configuration transmise à guard.js, sérialisée en JSON.
private struct GuardConfig: Encodable {
    struct Options: Encodable {
        let allowShared: Bool
        let cosmetics: Bool
    }

    let service: Service
    let options: Options
    let handler: String
}

/// Prépare le script injecté dans chaque page : guard.js précédé de sa configuration.
@MainActor
enum ScriptBuilder {
    /// Nom du canal par lequel guard.js prévient l'app.
    static let handlerName = "justeDM"

    static func userScripts(service: Service, allowShared: Bool, cosmetics: Bool) -> [WKUserScript] {
        guard let source = guardSource(service: service, allowShared: allowShared, cosmetics: cosmetics) else {
            assertionFailure("guard.js est absent de l'app")
            return []
        }
        // Monde isolé : le site ne voit pas ce script et ne peut pas parler à l'app à sa place.
        return [
            WKUserScript(source: source, injectionTime: .atDocumentStart, forMainFrameOnly: true, in: .defaultClient),
        ]
    }

    /// Même enveloppe que dans tests/browser/guard-browser.test.js.
    static func guardSource(service: Service, allowShared: Bool, cosmetics: Bool, bundle: Bundle = .main) -> String? {
        guard let file = bundle.url(forResource: "guard", withExtension: "js"),
              let script = try? String(contentsOf: file, encoding: .utf8)
        else { return nil }

        let config = GuardConfig(
            service: service,
            options: GuardConfig.Options(allowShared: allowShared, cosmetics: cosmetics),
            handler: handlerName
        )
        guard let data = try? JSONEncoder().encode(config),
              let json = String(data: data, encoding: .utf8)
        else { return nil }

        return "(function(){\n\"use strict\";\nvar CONFIG = \(json);\n\(script)\n})();"
    }
}

/// Relais qui évite que le contrôleur de scripts retienne l'écran en mémoire.
final class WeakScriptMessageHandler: NSObject, WKScriptMessageHandler {
    private weak var target: WKScriptMessageHandler?

    init(_ target: WKScriptMessageHandler) {
        self.target = target
    }

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        target?.userContentController(userContentController, didReceive: message)
    }
}
