import Combine
import Foundation
import UIKit
import WebKit

@MainActor
final class BrowserModel: NSObject, ObservableObject {
    let server: SavedServer
    let webView: WKWebView

    @Published private(set) var isLoading = false
    @Published private(set) var canGoBack = false
    @Published private(set) var canGoForward = false
    @Published private(set) var currentURL: URL?
    @Published private(set) var errorMessage: String?
    @Published private(set) var errorURL: URL?

    private let openExternal: (URL) -> Void
    private var hasLoadedInitialRequest = false

    init(
        server: SavedServer,
        openExternal: @escaping (URL) -> Void = { url in
            UIApplication.shared.open(url)
        }
    ) {
        self.server = server
        self.openExternal = openExternal

        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.allowsInlineMediaPlayback = true
        configuration.allowsAirPlayForMediaPlayback = false
        configuration.mediaTypesRequiringUserActionForPlayback = .all
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = false
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        let appVersion = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "unknown"
        configuration.applicationNameForUserAgent = "DSHNative/\(appVersion)"

        webView = WKWebView(frame: .zero, configuration: configuration)
        super.init()

        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.scrollView.keyboardDismissMode = .interactive
        webView.isOpaque = false
        webView.backgroundColor = .systemBackground
        webView.scrollView.backgroundColor = .systemBackground

        #if DEBUG
            webView.isInspectable = true
        #endif
    }

    func loadInitialRequestIfNeeded() {
        guard !hasLoadedInitialRequest else { return }
        hasLoadedInitialRequest = true
        load(server.url)
    }

    func retry() {
        errorMessage = nil
        errorURL = nil
        load(server.url)
    }

    func reloadOrStop() {
        if isLoading {
            webView.stopLoading()
            isLoading = false
            updateNavigationState()
        } else {
            errorMessage = nil
            webView.reload()
        }
    }

    func goBack() {
        guard webView.canGoBack else { return }
        webView.goBack()
    }

    func goForward() {
        guard webView.canGoForward else { return }
        webView.goForward()
    }

    func tearDown() {
        webView.stopLoading()
        webView.navigationDelegate = nil
        webView.uiDelegate = nil
    }

    private func load(_ url: URL) {
        let request = URLRequest(
            url: url,
            cachePolicy: .useProtocolCachePolicy,
            timeoutInterval: 60
        )
        webView.load(request)
    }

    private func updateNavigationState() {
        canGoBack = webView.canGoBack
        canGoForward = webView.canGoForward
        currentURL = webView.url
    }

    private func handleMainFrameNavigation(
        _ navigationAction: WKNavigationAction,
        decisionHandler: @escaping @MainActor @Sendable (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel)
            return
        }

        if url.absoluteString == "about:blank" {
            decisionHandler(.allow)
            return
        }

        let decision = ServerURLPolicy.classifyMainFrameNavigation(
            to: url,
            trustedURL: server.url,
            isUserInitiated: navigationAction.navigationType == .linkActivated
        )

        switch decision {
        case .allow:
            decisionHandler(.allow)
        case .external(let externalURL):
            openExternal(externalURL)
            decisionHandler(.cancel)
        case .deny:
            if url.scheme?.lowercased() == "https" {
                errorURL = url
                errorMessage =
                    "A navigation to \(url.host ?? "another host") was blocked. Open it explicitly in Safari to continue."
            } else {
                errorURL = nil
                errorMessage = "Only secure HTTPS pages and supported system links can be opened."
            }
            decisionHandler(.cancel)
        }
    }

    private func isTrustedDialogFrame(_ frame: WKFrameInfo) -> Bool {
        guard let trustedOrigin = WebOrigin(url: server.url) else { return false }
        let origin = frame.securityOrigin
        let effectivePort = origin.port == 0 ? 443 : origin.port
        return origin.protocol.lowercased() == trustedOrigin.scheme
            && origin.host.lowercased() == trustedOrigin.host
            && effectivePort == trustedOrigin.port
    }

    @discardableResult
    private func presentAlert(_ alert: UIAlertController, from webView: WKWebView) -> Bool {
        guard var presenter = webView.window?.rootViewController else { return false }
        while let presented = presenter.presentedViewController {
            presenter = presented
        }
        presenter.present(alert, animated: true)
        return true
    }
}

extension BrowserModel: WKNavigationDelegate {
    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping @MainActor @Sendable (WKNavigationActionPolicy) -> Void
    ) {
        guard let frame = navigationAction.targetFrame else {
            decisionHandler(.allow)
            return
        }

        guard frame.isMainFrame else {
            decisionHandler(.allow)
            return
        }

        handleMainFrameNavigation(navigationAction, decisionHandler: decisionHandler)
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationResponse: WKNavigationResponse,
        decisionHandler: @escaping @MainActor @Sendable (WKNavigationResponsePolicy) -> Void
    ) {
        guard navigationResponse.isForMainFrame else {
            decisionHandler(.allow)
            return
        }

        guard let url = navigationResponse.response.url else {
            errorMessage = "The server returned a response without a valid address."
            errorURL = nil
            decisionHandler(.cancel)
            return
        }
        guard ServerURLPolicy.isSameOrigin(url, as: server.url) else {
            errorMessage = "The server returned a cross-origin response. Open it explicitly in Safari to continue."
            errorURL = ServerURLPolicy.mayOpenExternally(url) ? url : nil
            decisionHandler(.cancel)
            return
        }
        guard navigationResponse.canShowMIMEType else {
            errorMessage = "This file cannot be displayed in DSH Native. Open it in Safari to download it."
            errorURL = url
            decisionHandler(.cancel)
            return
        }

        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        isLoading = true
        errorMessage = nil
        errorURL = nil
        updateNavigationState()
    }

    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        isLoading = true
        updateNavigationState()
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        isLoading = false
        errorMessage = nil
        errorURL = nil
        updateNavigationState()
    }

    func webView(
        _ webView: WKWebView,
        didFailProvisionalNavigation navigation: WKNavigation!,
        withError error: Error
    ) {
        handleLoadFailure(error)
    }

    func webView(
        _ webView: WKWebView,
        didFail navigation: WKNavigation!,
        withError error: Error
    ) {
        handleLoadFailure(error)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        isLoading = false
        updateNavigationState()
        errorMessage = "The web content process stopped. Reload to reconnect safely."
    }

    func webView(
        _ webView: WKWebView,
        didReceive challenge: URLAuthenticationChallenge,
        completionHandler: @escaping @MainActor @Sendable (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
    ) {
        completionHandler(.performDefaultHandling, nil)
    }

    private func handleLoadFailure(_ error: Error) {
        isLoading = false
        updateNavigationState()

        let nsError = error as NSError
        guard nsError.code != NSURLErrorCancelled else { return }

        if nsError.domain == NSURLErrorDomain,
            nsError.code == NSURLErrorServerCertificateUntrusted
        {
            errorMessage = "The server certificate is not trusted. DSH Native never bypasses iOS TLS checks."
        } else {
            errorMessage = nsError.localizedDescription
        }
    }
}

extension BrowserModel: WKUIDelegate {
    func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        guard navigationAction.targetFrame == nil,
            let url = navigationAction.request.url
        else {
            return nil
        }

        if ServerURLPolicy.isSameOrigin(url, as: server.url) {
            webView.load(navigationAction.request)
        } else if navigationAction.navigationType == .linkActivated,
            ServerURLPolicy.mayOpenExternally(url)
        {
            openExternal(url)
        }
        return nil
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptAlertPanelWithMessage message: String,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping @MainActor @Sendable () -> Void
    ) {
        guard isTrustedDialogFrame(frame) else {
            completionHandler()
            return
        }

        let alert = UIAlertController(title: server.displayHost, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
        if !presentAlert(alert, from: webView) {
            completionHandler()
        }
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptConfirmPanelWithMessage message: String,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping @MainActor @Sendable (Bool) -> Void
    ) {
        guard isTrustedDialogFrame(frame) else {
            completionHandler(false)
            return
        }

        let alert = UIAlertController(title: server.displayHost, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(false) })
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(true) })
        if !presentAlert(alert, from: webView) {
            completionHandler(false)
        }
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptTextInputPanelWithPrompt prompt: String,
        defaultText: String?,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping @MainActor @Sendable (String?) -> Void
    ) {
        guard isTrustedDialogFrame(frame) else {
            completionHandler(nil)
            return
        }

        let alert = UIAlertController(title: server.displayHost, message: prompt, preferredStyle: .alert)
        alert.addTextField { $0.text = defaultText }
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(nil) })
        alert.addAction(
            UIAlertAction(title: "OK", style: .default) { _ in
                completionHandler(alert.textFields?.first?.text)
            })

        if !presentAlert(alert, from: webView) {
            completionHandler(nil)
        }
    }

    func webView(
        _ webView: WKWebView,
        requestMediaCapturePermissionFor origin: WKSecurityOrigin,
        initiatedByFrame frame: WKFrameInfo,
        type: WKMediaCaptureType,
        decisionHandler: @escaping @MainActor @Sendable (WKPermissionDecision) -> Void
    ) {
        decisionHandler(.deny)
    }
}
