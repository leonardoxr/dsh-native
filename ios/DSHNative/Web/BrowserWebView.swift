import SwiftUI
import WebKit

struct BrowserWebView: UIViewRepresentable {
    @ObservedObject var model: BrowserModel

    func makeUIView(context: Context) -> WKWebView {
        model.webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        model.loadInitialRequestIfNeeded()
    }
}
