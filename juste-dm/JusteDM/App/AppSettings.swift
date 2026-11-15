import Combine
import Foundation

/// Réglages de l'app, conservés d'un lancement à l'autre.
final class AppSettings: ObservableObject {
    static let shared = AppSettings()

    private enum Key {
        static let allowShared = "allowShared"
        static let cosmetics = "cosmetics"
    }

    private let defaults: UserDefaults

    /// Autorise l'ouverture d'une publication, d'un reel ou d'une story reçus dans une conversation.
    @Published var allowShared: Bool {
        didSet { defaults.set(allowShared, forKey: Key.allowShared) }
    }

    /// Cache les menus du site qui mènent hors de la messagerie.
    @Published var cosmetics: Bool {
        didSet { defaults.set(cosmetics, forKey: Key.cosmetics) }
    }

    init(defaults: UserDefaults = .standard) {
        defaults.register(defaults: [Key.allowShared: true, Key.cosmetics: true])
        self.defaults = defaults
        self.allowShared = defaults.bool(forKey: Key.allowShared)
        self.cosmetics = defaults.bool(forKey: Key.cosmetics)
    }
}

extension ServiceCatalog {
    /// Catalogue livré avec l'app.
    static let bundled: ServiceCatalog = {
        guard let file = Bundle.main.url(forResource: "services", withExtension: "json"),
              let data = try? Data(contentsOf: file),
              let catalog = try? ServiceCatalog.decode(from: data),
              !catalog.services.isEmpty
        else {
            fatalError("services.json est absent ou illisible")
        }
        return catalog
    }()
}
