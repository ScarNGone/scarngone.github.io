import UIKit

final class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(
        _ scene: UIScene,
        willConnectTo session: UISceneSession,
        options connectionOptions: UIScene.ConnectionOptions
    ) {
        guard let windowScene = scene as? UIWindowScene else { return }

        // Un seul réseau pour l'instant : le premier de services.json.
        let service = ServiceCatalog.bundled.services[0]

        let window = UIWindow(windowScene: windowScene)
        window.rootViewController = MessagingViewController(service: service, settings: .shared)
        window.makeKeyAndVisible()
        self.window = window
    }
}
