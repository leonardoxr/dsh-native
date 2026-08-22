import SwiftUI

struct BrowserScreen: View {
    let server: SavedServer
    let onShowServers: () -> Void

    @StateObject private var model: BrowserModel
    @Environment(\.openURL) private var openURL

    init(server: SavedServer, onShowServers: @escaping () -> Void) {
        self.server = server
        self.onShowServers = onShowServers
        _model = StateObject(wrappedValue: BrowserModel(server: server))
    }

    var body: some View {
        ZStack {
            Color(.systemBackground)
                .ignoresSafeArea()

            BrowserWebView(model: model)
                .allowsHitTesting(model.errorMessage == nil)

            if let errorMessage = model.errorMessage {
                loadError(message: errorMessage)
            }
        }
        .safeAreaInset(edge: .top, spacing: 0) {
            browserHeader
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            browserToolbar
        }
        .onDisappear {
            model.tearDown()
        }
    }

    private var browserHeader: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                Button(action: onShowServers) {
                    Image(systemName: "rectangle.stack.fill")
                        .frame(width: 44, height: 44)
                }
                .buttonStyle(.bordered)
                .buttonBorderShape(.circle)
                .accessibilityLabel("Servers")
                .accessibilityHint("Closes this page and returns to the server list")
                .keyboardShortcut("h", modifiers: .command)

                VStack(alignment: .leading, spacing: 2) {
                    Text(server.name)
                        .font(.headline)
                        .lineLimit(1)
                    Label(server.displayHost, systemImage: "lock.fill")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }

                Spacer(minLength: 4)

                Menu {
                    Button {
                        openURL(model.currentURL ?? server.url)
                    } label: {
                        Label("Open in Safari", systemImage: "safari")
                    }

                    ShareLink(item: model.currentURL ?? server.url) {
                        Label("Share Link", systemImage: "square.and.arrow.up")
                    }

                    Divider()

                    Button(action: model.retry) {
                        Label("Reconnect to Server", systemImage: "arrow.clockwise")
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                        .font(.title3)
                        .frame(width: 44, height: 44)
                }
                .accessibilityLabel("Page options")
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 9)

            if model.isLoading {
                ProgressView()
                    .progressViewStyle(.linear)
                    .tint(Color("AccentColor"))
                    .accessibilityLabel("Loading page")
            }
        }
        .background(.ultraThinMaterial)
        .overlay(alignment: .bottom) {
            Divider()
        }
    }

    private var browserToolbar: some View {
        HStack(spacing: 10) {
            toolbarButton("chevron.backward", label: "Back", enabled: model.canGoBack, action: model.goBack)
                .keyboardShortcut("[", modifiers: .command)

            toolbarButton("chevron.forward", label: "Forward", enabled: model.canGoForward, action: model.goForward)
                .keyboardShortcut("]", modifiers: .command)

            toolbarButton(
                model.isLoading ? "xmark" : "arrow.clockwise",
                label: model.isLoading ? "Stop" : "Reload",
                enabled: true,
                action: model.reloadOrStop
            )
            .keyboardShortcut("r", modifiers: .command)

            Spacer()

            Label("HTTPS", systemImage: "lock.shield.fill")
                .font(.caption.weight(.semibold))
                .foregroundStyle(Color("AccentColor"))
                .accessibilityLabel("Secure HTTPS origin")
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 2)
        .background(.ultraThinMaterial)
        .overlay(alignment: .top) {
            Divider()
        }
    }

    private func toolbarButton(
        _ systemName: String,
        label: String,
        enabled: Bool,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.body.weight(.semibold))
                .frame(width: 44, height: 44)
        }
        .buttonStyle(.plain)
        .foregroundStyle(enabled ? AnyShapeStyle(.primary) : AnyShapeStyle(.tertiary))
        .disabled(!enabled)
        .accessibilityLabel(label)
    }

    private func loadError(message: String) -> some View {
        ContentUnavailableView {
            Label("Can’t Open Server", systemImage: "wifi.exclamationmark")
        } description: {
            Text(message)
        } actions: {
            VStack(spacing: 10) {
                HStack {
                    Button("Servers", action: onShowServers)
                        .buttonStyle(.bordered)
                    Button("Retry", action: model.retry)
                        .buttonStyle(.borderedProminent)
                }
                if let errorURL = model.errorURL {
                    Button {
                        openURL(errorURL)
                    } label: {
                        Label("Open in Safari", systemImage: "safari")
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding()
        .background(.regularMaterial)
        .contentShape(Rectangle())
    }
}
