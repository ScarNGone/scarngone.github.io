import Foundation

/// Décision prise pour une adresse que la page veut afficher.
enum NavigationDecision: Equatable {
    enum Kind: String, Equatable {
        /// Page de la messagerie.
        case messaging
        /// Page de connexion ou de sécurité du compte.
        case auth
        /// Contenu partagé dans une conversation.
        case shared
        /// Adresse technique sans contenu (`about:blank`).
        case neutral
    }

    case allow(Kind)
    case block
    /// À ouvrir hors de l'app, dans le navigateur du téléphone.
    case external(URL)
}

/// Règles de navigation d'un réseau. La même logique existe dans `guard.js` ;
/// les deux sont vérifiées par les mêmes cas dans `tests/policy-vectors.json`.
struct NavigationPolicy {
    let service: Service
    let allowShared: Bool

    private let hosts: Set<String>
    private let deny: [NSRegularExpression]
    private let messaging: [NSRegularExpression]
    private let auth: [NSRegularExpression]
    private let shared: [NSRegularExpression]
    private let immersive: [NSRegularExpression]
    private let extraHosts: [String: [NSRegularExpression]]
    private let redirectors: [String: String]
    private let blockedHosts: Set<String>

    init(service: Service, allowShared: Bool) throws {
        self.service = service
        self.allowShared = allowShared
        hosts = Set(service.hosts.map { $0.lowercased() })
        deny = try Self.compile(service.deny)
        messaging = try Self.compile(service.messaging)
        auth = try Self.compile(service.auth)
        shared = try Self.compile(service.shared)
        immersive = try Self.compile(service.immersive)

        var extra: [String: [NSRegularExpression]] = [:]
        for group in service.extraHosts {
            let patterns = try Self.compile(group.allow)
            for host in group.hosts {
                extra[host.lowercased()] = patterns
            }
        }
        extraHosts = extra

        var redirects: [String: String] = [:]
        for redirector in service.redirectors {
            redirects[redirector.host.lowercased()] = redirector.param
        }
        redirectors = redirects
        blockedHosts = Set(service.blockedHosts.map { $0.lowercased() })
    }

    /// Décide du sort de `url` quand la page affichée est `from`.
    func decide(_ url: URL, from: URL?) -> NavigationDecision {
        decide(url, from: from, depth: 0, viaRedirector: false)
    }

    /// Vrai pour une page de la messagerie.
    func isMessaging(_ url: URL) -> Bool {
        guard let host = url.host?.lowercased(), hosts.contains(host) else { return false }
        let path = Self.path(of: url)
        return !Self.matches(deny, path) && Self.matches(messaging, path)
    }

    /// Vrai pour une page où la barre d'outils de l'app doit s'effacer.
    func isImmersive(_ url: URL) -> Bool {
        guard let host = url.host?.lowercased(), hosts.contains(host) else { return false }
        return Self.matches(immersive, Self.path(of: url))
    }

    /// Vrai si `host` est un domaine du réseau lui-même.
    func isServiceHost(_ host: String) -> Bool {
        hosts.contains(host.lowercased())
    }

    /// Vrai si l'adresse appartient au réseau ou à un domaine toléré pour la connexion.
    /// Un refus sur ces domaines laisse l'app sur une page inutilisable, qu'il faut quitter.
    func ownsHost(of url: URL) -> Bool {
        guard let host = url.host?.lowercased() else { return false }
        return hosts.contains(host) || extraHosts[host] != nil
    }

    // MARK: - Détail

    private func decide(_ url: URL, from: URL?, depth: Int, viaRedirector: Bool) -> NavigationDecision {
        guard let scheme = url.scheme?.lowercased() else { return .block }
        switch scheme {
        case "http", "https":
            break
        case "about":
            return .allow(.neutral)
        case "mailto", "tel", "sms", "facetime", "facetime-audio":
            return .external(url)
        default:
            return .block
        }

        guard let host = url.host?.lowercased(), !host.isEmpty else { return .block }
        let path = Self.path(of: url)

        if hosts.contains(host) {
            if Self.matches(deny, path) { return .block }
            if Self.matches(messaging, path) { return .allow(.messaging) }
            if Self.matches(auth, path) { return .allow(.auth) }
            if allowShared, let key = sharedKey(path), let from {
                if isMessaging(from) { return .allow(.shared) }
                if let fromHost = from.host?.lowercased(), hosts.contains(fromHost),
                   sharedKey(Self.path(of: from)) == key {
                    return .allow(.shared)
                }
            }
            return .block
        }

        if let allowed = extraHosts[host] {
            return Self.matches(allowed, path) ? .allow(.auth) : .block
        }

        if let param = redirectors[host] {
            guard depth < 3,
                  let value = Self.queryValue(param, in: url),
                  let target = URL(string: value),
                  let targetScheme = target.scheme?.lowercased(),
                  targetScheme == "http" || targetScheme == "https"
            else { return .block }
            return decide(target, from: from, depth: depth + 1, viaRedirector: true)
        }

        if blockedHosts.contains(host), !viaRedirector { return .block }
        return .external(url)
    }

    /// Identifiant du contenu partagé désigné par `path`, ou `nil` si ce n'en est pas un.
    private func sharedKey(_ path: String) -> String? {
        let range = NSRange(path.startIndex..., in: path)
        for regex in shared {
            guard let match = regex.firstMatch(in: path, options: [], range: range) else { continue }
            if match.numberOfRanges > 1, let captured = Range(match.range(at: 1), in: path) {
                return String(path[captured])
            }
            return ""
        }
        return nil
    }

    private static func compile(_ patterns: [String]) throws -> [NSRegularExpression] {
        try patterns.map { try NSRegularExpression(pattern: $0) }
    }

    private static func matches(_ list: [NSRegularExpression], _ path: String) -> Bool {
        let range = NSRange(path.startIndex..., in: path)
        return list.contains { $0.firstMatch(in: path, options: [], range: range) != nil }
    }

    static func path(of url: URL) -> String {
        // Le moteur web résout déjà les « .. » avant de charger une page. On le refait ici
        // pour les adresses lues dans un paramètre de redirection.
        let source = url.path.contains("/.") ? url.standardized : url
        let path = URLComponents(url: source, resolvingAgainstBaseURL: true)?.percentEncodedPath ?? source.path
        return path.isEmpty ? "/" : path
    }

    private static func queryValue(_ name: String, in url: URL) -> String? {
        URLComponents(url: url, resolvingAgainstBaseURL: true)?
            .queryItems?
            .first { $0.name == name }?
            .value
    }
}
