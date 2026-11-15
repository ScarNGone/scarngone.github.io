import Combine
import SwiftUI
import UIKit
import WebKit

/// Écran principal : la messagerie du réseau, et rien d'autre.
///
/// Deux filets retiennent la navigation :
///   - `decidePolicyFor` filtre chaque chargement de page ;
///   - l'observation de `webView.url` rattrape les changements d'adresse que le site
///     fait sans rechargement, comme toute application web monopage.
/// Le script guard.js ajoute un troisième filet, plus confortable : il arrête les clics
/// refusés avant que le site ne réagisse.
final class MessagingViewController: UIViewController {
    private enum NoticeKind {
        case failure
        case loop
    }

    private static let blockedMessage = "Hors messagerie : page bloquée"

    private let service: Service
    private let settings: AppSettings
    private let homeURL: URL
    private let loginURL: URL
    private var policy: NavigationPolicy

    private var webView: WKWebView!
    private let stack = UIStackView()
    private let toolbar = UIToolbar(frame: CGRect(x: 0, y: 0, width: 320, height: 44))
    private let progressBar = UIProgressView(progressViewStyle: .bar)
    private let toast = ToastView()
    private let notice = NoticeView()
    private var noticeKind: NoticeKind?
    private var cancellables = Set<AnyCancellable>()

    /// Dernière page affichée et acceptée. C'est d'elle que part chaque navigation :
    /// un contenu partagé ne s'ouvre que depuis une conversation.
    private var context: URL?
    /// Adresse d'un chargement accepté qui n'a pas encore abouti.
    private var pendingURL: URL?
    /// Chemins que l'utilisateur a choisi d'afficher malgré les règles, jusqu'à la fermeture de l'app.
    private var exceptions = Set<String>()
    private var lastRefused: URL?
    /// Page refusée que l'app est en train de quitter.
    private var leavingURL: URL?
    private var recentRecoveries: [Date] = []
    /// Code de réponse de la dernière page reçue.
    private var pageStatus: Int?
    #if DEBUG
    private var selfTestStarted = false
    #endif

    init(service: Service, settings: AppSettings) {
        guard let home = URL(string: service.home),
              let login = URL(string: service.login),
              let policy = try? NavigationPolicy(service: service, allowShared: settings.allowShared)
        else {
            fatalError("Le réseau \(service.id) est mal décrit dans services.json")
        }
        self.service = service
        self.settings = settings
        self.homeURL = home
        self.loginURL = login
        self.policy = policy
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) n'est pas utilisé")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        buildWebView()
        buildLayout()
        observe()
        loadHome()
    }

    // MARK: - Construction

    private func buildWebView() {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.allowsInlineMediaPlayback = true
        configuration.applicationNameForUserAgent = Self.safariApplicationName
        configuration.defaultWebpagePreferences.preferredContentMode = .mobile
        configuration.userContentController.add(
            WeakScriptMessageHandler(self),
            contentWorld: .defaultClient,
            name: ScriptBuilder.handlerName
        )
        installUserScripts(
            allowShared: settings.allowShared,
            cosmetics: settings.cosmetics,
            in: configuration.userContentController
        )

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        // Un aperçu de lien afficherait la page visée sans passer par les règles.
        webView.allowsLinkPreview = false
        webView.isOpaque = false
        webView.backgroundColor = .systemBackground
        webView.scrollView.backgroundColor = .systemBackground
        #if DEBUG
        if #available(iOS 16.4, *) {
            webView.isInspectable = true
        }
        #endif
        self.webView = webView
    }

    /// Complète l'identité du navigateur pour que le site serve sa version mobile ordinaire,
    /// celle que reçoit Safari. Sans cela, certains sites proposent une version réduite.
    private static var safariApplicationName: String {
        let parts = UIDevice.current.systemVersion.split(separator: ".")
        let major = parts.first.map(String.init) ?? "17"
        let minor = parts.count > 1 ? String(parts[1]) : "0"
        return "Version/\(major).\(minor) Mobile/15E148 Safari/604.1"
    }

    private func installUserScripts(allowShared: Bool, cosmetics: Bool, in controller: WKUserContentController) {
        controller.removeAllUserScripts()
        for script in ScriptBuilder.userScripts(service: service, allowShared: allowShared, cosmetics: cosmetics) {
            controller.addUserScript(script)
        }
    }

    private func buildLayout() {
        toolbar.items = [
            barButton("tray", label: "Boîte de réception", action: #selector(goHome)),
            .flexibleSpace(),
            barButton("arrow.clockwise", label: "Recharger", action: #selector(reloadPage)),
            .flexibleSpace(),
            barButton("gearshape", label: "Réglages", action: #selector(openSettings)),
        ]
        toolbar.setContentHuggingPriority(.required, for: .vertical)
        toolbar.setContentCompressionResistancePriority(.required, for: .vertical)

        stack.axis = .vertical
        stack.translatesAutoresizingMaskIntoConstraints = false
        stack.addArrangedSubview(webView)
        stack.addArrangedSubview(toolbar)
        view.addSubview(stack)

        progressBar.translatesAutoresizingMaskIntoConstraints = false
        progressBar.alpha = 0
        view.addSubview(progressBar)
        view.addSubview(notice)
        view.addSubview(toast)

        let guide = view.safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            stack.topAnchor.constraint(equalTo: guide.topAnchor),
            stack.bottomAnchor.constraint(equalTo: guide.bottomAnchor),
            stack.leadingAnchor.constraint(equalTo: guide.leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: guide.trailingAnchor),

            progressBar.topAnchor.constraint(equalTo: guide.topAnchor),
            progressBar.leadingAnchor.constraint(equalTo: guide.leadingAnchor),
            progressBar.trailingAnchor.constraint(equalTo: guide.trailingAnchor),

            notice.topAnchor.constraint(equalTo: guide.topAnchor),
            notice.bottomAnchor.constraint(equalTo: guide.bottomAnchor),
            notice.leadingAnchor.constraint(equalTo: guide.leadingAnchor),
            notice.trailingAnchor.constraint(equalTo: guide.trailingAnchor),

            toast.topAnchor.constraint(equalTo: guide.topAnchor, constant: 56),
            toast.centerXAnchor.constraint(equalTo: guide.centerXAnchor),
            toast.leadingAnchor.constraint(greaterThanOrEqualTo: guide.leadingAnchor, constant: 24),
            toast.trailingAnchor.constraint(lessThanOrEqualTo: guide.trailingAnchor, constant: -24),
        ])
    }

    private func barButton(_ symbol: String, label: String, action: Selector) -> UIBarButtonItem {
        let item = UIBarButtonItem(image: UIImage(systemName: symbol), style: .plain, target: self, action: action)
        item.accessibilityLabel = label
        return item
    }

    private func observe() {
        webView.publisher(for: \.url, options: [.new])
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in self?.currentURLDidChange() }
            .store(in: &cancellables)

        webView.publisher(for: \.estimatedProgress, options: [.new])
            .receive(on: DispatchQueue.main)
            .sink { [weak self] value in self?.updateProgress(value) }
            .store(in: &cancellables)

        settings.$allowShared
            .combineLatest(settings.$cosmetics)
            .dropFirst()
            .removeDuplicates { $0 == $1 }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] allowShared, cosmetics in
                self?.applySettings(allowShared: allowShared, cosmetics: cosmetics)
            }
            .store(in: &cancellables)
    }

    // MARK: - Chargements

    private func load(_ url: URL) {
        pendingURL = url
        webView.load(URLRequest(url: url))
    }

    private func loadHome() {
        hideNotice()
        recentRecoveries.removeAll()
        load(homeURL)
    }

    private func loadLogin() {
        hideNotice()
        recentRecoveries.removeAll()
        load(loginURL)
    }

    @objc private func goHome() {
        loadHome()
    }

    @objc private func reloadPage() {
        hideNotice()
        if webView.url == nil {
            loadHome()
        } else {
            webView.reload()
        }
    }

    @objc private func openSettings() {
        let content = SettingsView(
            settings: settings,
            serviceName: service.name,
            onReload: { [weak self] in
                self?.dismiss(animated: true)
                self?.loadHome()
            },
            onSignOut: { [weak self] in
                self?.dismiss(animated: true)
                self?.signOut()
            },
            onClose: { [weak self] in
                self?.dismiss(animated: true)
            }
        )
        let controller = UIHostingController(rootView: content)
        if let sheet = controller.sheetPresentationController {
            sheet.detents = [.medium(), .large()]
            sheet.prefersGrabberVisible = true
        }
        present(controller, animated: true)
    }

    private func applySettings(allowShared: Bool, cosmetics: Bool) {
        guard let updated = try? NavigationPolicy(service: service, allowShared: allowShared) else { return }
        policy = updated
        installUserScripts(
            allowShared: allowShared,
            cosmetics: cosmetics,
            in: webView.configuration.userContentController
        )
        // Le script injecté ne change qu'au prochain chargement de page.
        loadHome()
    }

    private func signOut() {
        Task { [weak self] in
            guard let self else { return }
            let store = self.webView.configuration.websiteDataStore
            await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
                store.removeData(
                    ofTypes: WKWebsiteDataStore.allWebsiteDataTypes(),
                    modifiedSince: .distantPast
                ) {
                    continuation.resume()
                }
            }
            self.context = nil
            self.exceptions.removeAll()
            self.loadLogin()
        }
    }

    private func openExternally(_ url: URL) {
        UIApplication.shared.open(url, options: [:], completionHandler: nil)
    }

    // MARK: - Règles

    private func decide(_ url: URL) -> NavigationDecision {
        if policy.ownsHost(of: url), exceptions.contains(NavigationPolicy.path(of: url)) {
            return .allow(.auth)
        }
        return policy.decide(url, from: context)
    }

    private func currentURLDidChange() {
        updateChrome()
        guard let url = webView.url else { return }
        if url != leavingURL {
            leavingURL = nil
        }
        if url == pendingURL {
            // Chargement accepté et encore en cours : on attend qu'il aboutisse.
            if webView.isLoading { return }
            pendingURL = nil
        }
        adopt(url)
    }

    /// Applique les règles à l'adresse réellement affichée.
    private func adopt(_ url: URL) {
        if url == context { return }
        let decision = decide(url)
        trace("adresse affichée \(url.absoluteString) : \(decision)")
        switch decision {
        case .allow(let kind):
            if kind != .neutral {
                context = url
            }
        case .block, .external:
            leaveBlockedPage(url)
        }
    }

    /// Le site a changé d'adresse sans rechargement, vers une page refusée.
    private func leaveBlockedPage(_ url: URL) {
        // L'observation, didCommit et didFinish peuvent signaler la même page : une seule sortie.
        if leavingURL == url { return }
        leavingURL = url
        lastRefused = url
        toast.show(Self.blockedMessage)

        if let context, let back = webView.backForwardList.backItem, back.url == context {
            trace("retour à la page précédente")
            webView.goBack()
            // Si le retour n'a pas eu lieu, on recharge une page sûre.
            Task { [weak self] in
                try? await Task.sleep(nanoseconds: 1_500_000_000)
                guard let self, self.leavingURL == url, self.webView.url == url else { return }
                self.recover()
            }
        } else {
            recover()
        }
    }

    /// Ramène l'app sur une page utile : la messagerie si une session est ouverte, la connexion sinon.
    private func recover() {
        // Quatre retours forcés en trente secondes : le site tourne en rond, on s'arrête.
        let now = Date()
        recentRecoveries = recentRecoveries.filter { now.timeIntervalSince($0) < 30 }
        recentRecoveries.append(now)
        guard recentRecoveries.count <= 3 else {
            recentRecoveries.removeAll()
            trace("renvois en boucle, arrêt")
            showLoopNotice()
            return
        }

        Task { [weak self] in
            guard let self else { return }
            let signedIn = await self.hasSession()
            self.trace("retour forcé vers \(signedIn ? "la messagerie" : "la connexion")")
            self.load(signedIn ? self.homeURL : self.loginURL)
        }
    }

    private func hasSession() async -> Bool {
        guard let cookie = service.sessionCookie else { return true }
        let store = webView.configuration.websiteDataStore.httpCookieStore
        let cookies: [HTTPCookie] = await withCheckedContinuation { continuation in
            store.getAllCookies { cookies in
                continuation.resume(returning: cookies)
            }
        }
        let now = Date()
        let domain = cookie.domain.lowercased()
        return cookies.contains { candidate in
            candidate.name == cookie.name
                && candidate.domain.lowercased().hasSuffix(domain)
                && !candidate.value.isEmpty
                && (candidate.expiresDate.map { $0 > now } ?? true)
        }
    }

    // MARK: - Habillage

    private func updateChrome() {
        let immersive = webView.url.map { policy.isImmersive($0) } ?? false
        guard toolbar.isHidden != immersive else { return }
        UIView.animate(withDuration: 0.2) {
            self.toolbar.isHidden = immersive
            self.stack.layoutIfNeeded()
        }
    }

    private func updateProgress(_ value: Double) {
        progressBar.setProgress(Float(value), animated: value > Double(progressBar.progress))
        UIView.animate(withDuration: 0.25) {
            self.progressBar.alpha = value >= 1 ? 0 : 1
        }
    }

    private func hideNotice() {
        noticeKind = nil
        notice.hide()
    }

    /// Une page sans texte ni script ne s'affichera jamais : le site a refusé de répondre,
    /// souvent parce qu'il limite temporairement la connexion. On le dit plutôt que de
    /// laisser un écran blanc.
    private func reportEmptyPage() {
        let status = pageStatus
        Task { [weak self] in
            guard let self else { return }
            let script = "String((document.body ? document.body.innerText.trim().length : 0) + document.scripts.length)"
            guard await self.evaluate(script, in: .defaultClient) == "0" else { return }
            let code = status.map { " (code \($0))" } ?? ""
            self.trace("page vide\(code)")
            self.showFailureNotice(
                "\(self.service.name) a renvoyé une page vide\(code). Le site limite parfois une connexion pendant quelques minutes, par exemple derrière un VPN."
            )
        }
    }

    private func evaluate(_ script: String, in world: WKContentWorld) async -> String {
        await withCheckedContinuation { (continuation: CheckedContinuation<String, Never>) in
            webView.evaluateJavaScript(script, in: nil, in: world) { result in
                switch result {
                case .success(let value):
                    continuation.resume(returning: String(describing: value))
                case .failure(let error):
                    continuation.resume(returning: "erreur : \(error.localizedDescription)")
                }
            }
        }
    }

    private func showFailureNotice(_ reason: String) {
        noticeKind = .failure
        notice.show(
            title: "La messagerie ne s’affiche pas",
            message: reason,
            actions: [
                NoticeView.Action(title: "Réessayer", isPrimary: true, handler: { [weak self] in
                    self?.reloadPage()
                }),
            ]
        )
    }

    private func showLoopNotice() {
        noticeKind = .loop
        let refused = lastRefused
        let page = refused.map { ($0.host ?? "") + NavigationPolicy.path(of: $0) } ?? "une autre page"

        var actions = [
            NoticeView.Action(title: "Réessayer", isPrimary: true, handler: { [weak self] in
                self?.loadHome()
            }),
            NoticeView.Action(title: "Ouvrir la page de connexion", isPrimary: false, handler: { [weak self] in
                self?.loadLogin()
            }),
        ]
        if let refused, policy.ownsHost(of: refused) {
            actions.append(NoticeView.Action(title: "Afficher quand même cette page", isPrimary: false, handler: { [weak self] in
                self?.allowForThisSession(refused)
            }))
        }

        notice.show(
            title: "\(service.name) renvoie vers une autre page",
            message: "Le site insiste pour afficher \(page), qui ne fait pas partie de la messagerie.",
            actions: actions
        )
    }

    private func allowForThisSession(_ url: URL) {
        exceptions.insert(NavigationPolicy.path(of: url))
        hideNotice()
        recentRecoveries.removeAll()
        load(url)
    }
}

// MARK: - Navigation

extension MessagingViewController: WKNavigationDelegate {
    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction
    ) async -> WKNavigationActionPolicy {
        guard let url = navigationAction.request.url else { return .cancel }

        // Les cadres internes (captcha, consentement) ne changent pas la page affichée.
        if let target = navigationAction.targetFrame, !target.isMainFrame {
            return .allow
        }

        let opensNewWindow = navigationAction.targetFrame == nil
        let userInitiated = navigationAction.navigationType == .linkActivated || opensNewWindow
        let decision = decide(url)
        trace("demande \(url.absoluteString)\(userInitiated ? " (clic)" : "") : \(decision)")

        switch decision {
        case .allow(let kind):
            if opensNewWindow {
                // Pas de deuxième fenêtre : la page remplace la page courante.
                // Une fenêtre vide, elle, n'a rien à afficher.
                if kind == .neutral { return .cancel }
                pendingURL = url
                webView.load(navigationAction.request)
                return .cancel
            }
            pendingURL = url
            return .allow

        case .external(let target):
            openExternally(target)
            return .cancel

        case .block:
            if userInitiated {
                toast.show(Self.blockedMessage)
            } else if policy.ownsHost(of: url), leavingURL != url {
                // Redirection du site vers une page refusée : la page courante n'est plus fiable.
                // Si l'observation de l'adresse l'a vue en premier, la sortie est déjà engagée.
                lastRefused = url
                recover()
            }
            return .cancel
        }
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationResponse: WKNavigationResponse
    ) async -> WKNavigationResponsePolicy {
        if navigationResponse.isForMainFrame, let response = navigationResponse.response as? HTTPURLResponse {
            pageStatus = response.statusCode
            trace("réponse \(response.statusCode) pour \(response.url?.absoluteString ?? "")")
        }
        // Même choix que le moteur web quand l'app ne se prononce pas.
        return navigationResponse.canShowMIMEType ? .allow : .cancel
    }

    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        pendingURL = nil
        if noticeKind == .failure {
            hideNotice()
        }
        updateChrome()
        if let url = webView.url {
            adopt(url)
        }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        pendingURL = nil
        updateChrome()
        if let url = webView.url {
            adopt(url)
        }
        trace("page chargée \(webView.url?.absoluteString ?? "sans adresse")")
        reportEmptyPage()
        #if DEBUG
        runSelfTestIfRequested()
        #endif
    }

    func webView(
        _ webView: WKWebView,
        didFailProvisionalNavigation navigation: WKNavigation!,
        withError error: Error
    ) {
        pendingURL = nil
        let failure = error as NSError
        // Annulations provoquées par nos propres refus ou par un chargement plus récent.
        if failure.domain == NSURLErrorDomain, failure.code == NSURLErrorCancelled { return }
        if failure.domain == "WebKitErrorDomain", failure.code == 102 { return }
        trace("échec du chargement : \(failure.localizedDescription)")
        showFailureNotice(failure.localizedDescription)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        // iOS a déchargé la page pour récupérer de la mémoire.
        if webView.url == nil {
            loadHome()
        } else {
            webView.reload()
        }
    }
}

// MARK: - Fenêtres, dialogues et autorisations

extension MessagingViewController: WKUIDelegate {
    func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        // Les ouvertures de fenêtre sont déjà traitées dans decidePolicyFor.
        nil
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptAlertPanelWithMessage message: String,
        initiatedByFrame frame: WKFrameInfo
    ) async {
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in
                continuation.resume()
            })
            presentDialog(alert, otherwise: { continuation.resume() })
        }
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptConfirmPanelWithMessage message: String,
        initiatedByFrame frame: WKFrameInfo
    ) async -> Bool {
        await withCheckedContinuation { (continuation: CheckedContinuation<Bool, Never>) in
            let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "Annuler", style: .cancel) { _ in
                continuation.resume(returning: false)
            })
            alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in
                continuation.resume(returning: true)
            })
            presentDialog(alert, otherwise: { continuation.resume(returning: false) })
        }
    }

    func webView(
        _ webView: WKWebView,
        decideMediaCapturePermissionsFor origin: WKSecurityOrigin,
        initiatedBy frame: WKFrameInfo,
        type: WKMediaCaptureType
    ) async -> WKPermissionDecision {
        // iOS demande déjà l'accès au micro et à la caméra pour l'app ; inutile de reposer
        // la question à chaque message vocal.
        policy.isServiceHost(origin.host) ? .grant : .deny
    }

    /// Présente un dialogue du site, ou appelle `otherwise` si l'écran ne peut pas le montrer.
    private func presentDialog(_ alert: UIAlertController, otherwise: () -> Void) {
        guard presentedViewController == nil, view.window != nil else {
            otherwise()
            return
        }
        present(alert, animated: true)
    }
}

// MARK: - Messages de guard.js

extension MessagingViewController: WKScriptMessageHandler {
    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        guard message.name == ScriptBuilder.handlerName,
              let body = message.body as? [String: Any],
              body["type"] as? String == "blocked"
        else { return }
        trace("clic refusé par guard.js : \(body["url"] as? String ?? "")")
        toast.show(Self.blockedMessage)
    }
}

// MARK: - Mise au point

extension MessagingViewController {
    /// Écrit dans la console de Xcode. Absent des versions installées pour de bon.
    private func trace(_ message: @autoclosure () -> String) {
        #if DEBUG
        print("JusteDM | \(message())")
        #endif
    }
}

#if DEBUG
extension MessagingViewController {
    /// Essai automatique, lancé avec l'argument `-JusteDMSelfTest`. Il vérifie dans le vrai
    /// moteur web que chacun des trois filets retient une navigation vers une page refusée :
    /// un clic, deux changements d'adresse sans rechargement et une navigation par script.
    private func runSelfTestIfRequested() {
        guard !selfTestStarted, ProcessInfo.processInfo.arguments.contains("-JusteDMSelfTest") else { return }
        selfTestStarted = true

        Task { [weak self] in
            guard let self else { return }
            let pause: UInt64 = 1_000_000_000

            try? await Task.sleep(nanoseconds: 3 * pause)
            await self.probe("départ")

            self.trace("essai 1 : clic sur un lien refusé")
            let click = "var a = document.createElement('a'); a.href = '/explore/'; a.textContent = 'essai';"
                + " document.body.appendChild(a); a.click(); a.remove(); location.pathname"
            let afterClick = await self.evaluate(click, in: .page)
            self.trace("essai 1, adresse juste après : \(afterClick)")
            try? await Task.sleep(nanoseconds: 4 * pause)
            await self.probe("après l'essai 1")

            self.trace("essai 2 : changement d'adresse sans rechargement")
            let push = "history.pushState({}, '', '/explore/'); location.pathname"
            let afterPush = await self.evaluate(push, in: .page)
            self.trace("essai 2, adresse juste après : \(afterPush)")
            try? await Task.sleep(nanoseconds: 4 * pause)
            await self.probe("après l'essai 2")

            self.trace("essai 3 : navigation par script")
            _ = await self.evaluate("location.href = '/explore/'; 1", in: .page)
            try? await Task.sleep(nanoseconds: 12 * pause)
            await self.probe("après l'essai 3")

            self.trace("essai 4 : adresse remplacée sans rechargement")
            let replace = "history.replaceState({}, '', '/reels/'); location.pathname"
            let afterReplace = await self.evaluate(replace, in: .page)
            self.trace("essai 4, adresse juste après : \(afterReplace)")
            try? await Task.sleep(nanoseconds: 12 * pause)
            await self.probe("après l'essai 4")

            self.trace("essai terminé")
        }
    }

    /// Résume l'état de la page vue par guard.js.
    private func probe(_ label: String) async {
        let script = """
        (function () {
          var hidden = Array.from(document.querySelectorAll('[data-justedm-hidden]')).map(function (e) {
            return e.tagName.toLowerCase() + ' ' + (e.getAttribute('href') || '');
          });
          var viewport = document.querySelector('meta[name=viewport]');
          return JSON.stringify({
            adresse: location.href,
            titre: document.title,
            etat: document.readyState,
            navigateur: navigator.userAgent,
            largeur: window.innerWidth,
            viewport: viewport ? viewport.getAttribute('content') : null,
            taille: document.documentElement.outerHTML.length,
            scripts: document.scripts.length,
            liens: document.querySelectorAll('a[href]').length,
            champs: document.querySelectorAll('input').length,
            texte: document.body ? document.body.innerText.trim().slice(0, 240) : null,
            caches: hidden
          });
        })()
        """
        let summary = await evaluate(script, in: .defaultClient)
        trace("\(label) : \(summary)")
    }
}
#endif
