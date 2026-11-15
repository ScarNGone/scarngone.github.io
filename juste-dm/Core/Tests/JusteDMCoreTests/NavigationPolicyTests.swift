import XCTest
@testable import JusteDMCore

/// Vérifie NavigationPolicy avec les cas de `tests/policy-vectors.json`,
/// les mêmes que ceux appliqués à `guard.js` par `tests/policy.test.js`.
final class NavigationPolicyTests: XCTestCase {
    private struct Vectors: Decodable {
        struct Expectation: Decodable {
            let action: String
            let kind: String?
            let url: String?
        }

        struct Case: Decodable {
            let name: String
            let url: String
            let from: String?
            let allowShared: Bool?
            let expect: Expectation
        }

        let service: String
        let inbox: String
        let thread: String
        let cases: [Case]
    }

    /// Dossier `juste-dm`, quatre niveaux au-dessus de ce fichier.
    private static let projectRoot = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .deletingLastPathComponent()

    private func loadCatalog() throws -> ServiceCatalog {
        let file = Self.projectRoot.appendingPathComponent("JusteDM/Resources/services.json")
        return try ServiceCatalog.decode(from: Data(contentsOf: file))
    }

    private func loadVectors() throws -> Vectors {
        let file = Self.projectRoot.appendingPathComponent("tests/policy-vectors.json")
        return try JSONDecoder().decode(Vectors.self, from: Data(contentsOf: file))
    }

    private func describe(_ decision: NavigationDecision) -> String {
        switch decision {
        case .allow(let kind):
            return "allow:\(kind.rawValue)"
        case .block:
            return "block"
        case .external(let url):
            return "external:\(url.absoluteString)"
        }
    }

    private func describe(_ expectation: Vectors.Expectation) -> String {
        switch expectation.action {
        case "allow":
            return "allow:\(expectation.kind ?? "")"
        case "external":
            return "external:\(expectation.url ?? "")"
        default:
            return expectation.action
        }
    }

    func testEveryServiceOpensItsMessagingAndLoginPages() throws {
        let catalog = try loadCatalog()
        XCTAssertFalse(catalog.services.isEmpty)
        for service in catalog.services {
            let policy = try NavigationPolicy(service: service, allowShared: true)
            let home = try XCTUnwrap(URL(string: service.home), service.id)
            let login = try XCTUnwrap(URL(string: service.login), service.id)
            XCTAssertEqual(policy.decide(home, from: nil), .allow(.messaging), service.id)
            XCTAssertEqual(policy.decide(login, from: nil), .allow(.auth), service.id)
            XCTAssertTrue(policy.isMessaging(home), service.id)
        }
    }

    func testSharedVectors() throws {
        let catalog = try loadCatalog()
        let vectors = try loadVectors()
        let service = try XCTUnwrap(catalog.service(withID: vectors.service))
        XCTAssertFalse(vectors.cases.isEmpty)

        for vector in vectors.cases {
            let policy = try NavigationPolicy(service: service, allowShared: vector.allowShared ?? true)
            let url = try XCTUnwrap(URL(string: vector.url), vector.name)
            let from = vector.from.flatMap { URL(string: $0) }
            XCTAssertEqual(describe(policy.decide(url, from: from)), describe(vector.expect), vector.name)
        }
    }

    func testToolbarHidesInsideAThreadOnly() throws {
        let catalog = try loadCatalog()
        let vectors = try loadVectors()
        let service = try XCTUnwrap(catalog.service(withID: vectors.service))
        let policy = try NavigationPolicy(service: service, allowShared: true)

        XCTAssertTrue(policy.isImmersive(try XCTUnwrap(URL(string: vectors.thread))))
        XCTAssertFalse(policy.isImmersive(try XCTUnwrap(URL(string: vectors.inbox))))
        XCTAssertFalse(policy.isImmersive(try XCTUnwrap(URL(string: "https://example.org/direct/t/1/"))))
    }
}
