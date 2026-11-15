import Foundation

/// Liste des réseaux connus de l'app, lue depuis `services.json`.
struct ServiceCatalog: Codable, Equatable {
    let version: Int
    let services: [Service]

    static func decode(from data: Data) throws -> ServiceCatalog {
        try JSONDecoder().decode(ServiceCatalog.self, from: data)
    }

    func service(withID id: String) -> Service? {
        services.first { $0.id == id }
    }
}

/// Description d'un réseau : où se trouve sa messagerie et quelles pages ont le droit de s'afficher.
///
/// Tous les motifs sont des expressions régulières appliquées au chemin de l'adresse
/// (`/direct/inbox/` par exemple). Ils sont lus à l'identique par `guard.js`, d'où la
/// syntaxe volontairement simple.
struct Service: Codable, Equatable {
    struct SessionCookie: Codable, Equatable {
        let name: String
        let domain: String
    }

    struct ExtraHosts: Codable, Equatable {
        let hosts: [String]
        let allow: [String]
    }

    struct Redirector: Codable, Equatable {
        let host: String
        let param: String
    }

    let id: String
    let name: String
    /// Adresse de la messagerie, chargée au lancement.
    let home: String
    /// Adresse de connexion, utilisée quand aucune session n'est ouverte.
    let login: String
    /// Cookie dont la présence indique une session ouverte.
    let sessionCookie: SessionCookie?
    /// Domaines du réseau soumis aux règles de chemin ci-dessous.
    let hosts: [String]
    /// Chemins toujours refusés, même s'ils correspondent à une autre règle.
    let deny: [String]
    /// Chemins de la messagerie.
    let messaging: [String]
    /// Chemins nécessaires à la connexion et à la sécurité du compte.
    let auth: [String]
    /// Contenus partagés dans une conversation. Le premier groupe capturé identifie le contenu.
    let shared: [String]
    /// Autres domaines tolérés pour la connexion, avec leurs chemins.
    let extraHosts: [ExtraHosts]
    /// Domaines de redirection qui enveloppent les liens externes.
    let redirectors: [Redirector]
    /// Domaines jamais ouverts quand le site y renvoie de lui-même.
    let blockedHosts: [String]
    /// Chemins où la barre d'outils de l'app s'efface.
    let immersive: [String]
    /// Sélecteurs CSS des éléments à cacher.
    let hide: [String]
    /// Liens de navigation qui permettent de repérer les barres de menu à cacher.
    let navLinks: [String]
}
