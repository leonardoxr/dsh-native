import SwiftUI

struct BrowserScreen: View {
    let server: SavedServer
    @ObservedObject var store: ServerStore
    let onSelectServer: (SavedServer) -> Void
    let onShowServers: () -> Void

    @State private var showingServers = false
    @State private var showingTrustRevokeConfirmation = false
    @StateObject private var model: BrowserModel
    @Environment(\.openURL) private var openURL
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    init(
        server: SavedServer,
        store: ServerStore,
        onSelectServer: @escaping (SavedServer) -> Void,
        onShowServers: @escaping () -> Void
    ) {
        self.server = server
        _store = ObservedObject(wrappedValue: store)
        self.onSelectServer = onSelectServer
        self.onShowServers = onShowServers
        _model = StateObject(wrappedValue: BrowserModel(server: server, store: store))
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

            if showingServers {
                Color.black.opacity(0.28)
                    .ignoresSafeArea()
                    .contentShape(Rectangle())
                    .onTapGesture { closeServersDrawer() }
                    .transition(.opacity)
                    .zIndex(1)

                serverDrawer
                    .transition(.move(edge: .leading))
                    .zIndex(2)
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
        .alert(item: $model.certificateTrustPrompt) { prompt in
            Alert(
                title: Text(prompt.isReplacement ? "Certificate changed" : "Certificate not trusted"),
                message: Text(
                    "Host: \(prompt.host)\nSHA-256: \(prompt.fingerprint)\n\nTrusting this exact certificate is a per-server exception. Continue only if you recognize it."
                ),
                primaryButton: .destructive(
                    Text(prompt.isReplacement ? "Trust new certificate" : "Trust certificate"),
                    action: model.acceptCertificateTrust
                ),
                secondaryButton: .cancel(Text("Cancel"), action: model.rejectCertificateTrust)
            )
        }
        .confirmationDialog(
            "Revoke manual certificate trust?",
            isPresented: $showingTrustRevokeConfirmation,
            titleVisibility: .visible
        ) {
            Button("Revoke Trust", role: .destructive, action: model.revokeCertificateTrust)
            Button("Cancel", role: .cancel) {}
        } message: {
            Text(
                "Saved SHA-256: \(server.trustedCertificateFingerprint ?? "unknown")\n\n"
                    + "The next connection will require a new explicit review of the certificate."
            )
        }
    }

    private var browserHeader: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                Button(action: toggleServersDrawer) {
                    Image(systemName: "rectangle.stack.fill")
                        .frame(width: 44, height: 44)
                }
                .buttonStyle(.bordered)
                .buttonBorderShape(.circle)
                .accessibilityLabel("Servers")
                .accessibilityHint("Opens the server drawer without leaving this page")
                .keyboardShortcut("h", modifiers: .command)

                VStack(alignment: .leading, spacing: 2) {
                    Text(server.name)
                        .font(.headline)
                        .lineLimit(1)
                    Label(server.displayHost, systemImage: "lock.fill")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                    if model.hasManuallyTrustedCertificate {
                        Button {
                            showingTrustRevokeConfirmation = true
                        } label: {
                            Label(
                                "Manually trusted certificate",
                                systemImage: "exclamationmark.triangle.fill"
                            )
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(.orange)
                        }
                        .buttonStyle(.plain)
                        .accessibilityHint("Opens the option to revoke this certificate trust")
                    }
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

    private func serverDrawerRow(_ candidate: SavedServer) -> some View {
        let isCurrent = candidate.id == server.id
        return Button {
            closeServersDrawer()
            onSelectServer(candidate)
        } label: {
            HStack(spacing: 12) {
                Image(systemName: isCurrent ? "checkmark.circle.fill" : "server.rack")
                    .foregroundStyle(isCurrent ? Color("AccentColor") : Color.secondary)
                    .frame(width: 24)
                VStack(alignment: .leading, spacing: 3) {
                    Text(candidate.name)
                        .font(.body.weight(isCurrent ? .semibold : .regular))
                        .lineLimit(1)
                    Text(candidate.displayHost)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                Spacer(minLength: 0)
            }
            .frame(maxWidth: .infinity, minHeight: 56, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 12)
        .background(
            isCurrent
                ? Color("AccentColor").opacity(0.12)
                : Color.primary.opacity(0.04),
            in: RoundedRectangle(cornerRadius: 14, style: .continuous)
        )
        .accessibilityLabel(
            "\(candidate.name), secure server \(candidate.displayHost)"
        )
        .accessibilityHint(
            isCurrent ? "Currently open" : "Switches to this server"
        )
    }

    private func toggleServersDrawer() {
        if reduceMotion {
            showingServers.toggle()
        } else {
            withAnimation(.easeOut(duration: 0.22)) { showingServers.toggle() }
        }
    }

    private func closeServersDrawer() {
        if reduceMotion {
            showingServers = false
        } else {
            withAnimation(.easeOut(duration: 0.22)) { showingServers = false }
        }
    }

    private var serverDrawer: some View {
        GeometryReader { proxy in
            HStack(spacing: 0) {
                VStack(alignment: .leading, spacing: 0) {
                    HStack {
                        Text("Servers")
                            .font(.title2.weight(.bold))
                        Spacer()
                        Button(action: closeServersDrawer) {
                            Image(systemName: "xmark")
                                .frame(width: 44, height: 44)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Close server drawer")
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 14)
                    .padding(.bottom, 8)

                    Divider()

                    ScrollView {
                        LazyVStack(spacing: 8) {
                            ForEach(store.orderedServers) { candidate in
                                serverDrawerRow(candidate)
                            }
                        }
                        .padding(16)
                    }

                    Divider()

                    Button {
                        closeServersDrawer()
                        onShowServers()
                    } label: {
                        Label("Manage Servers", systemImage: "slider.horizontal.3")
                            .frame(maxWidth: .infinity, minHeight: 48, alignment: .leading)
                    }
                    .buttonStyle(.plain)
                    .padding(.horizontal, 20)
                    .padding(.vertical, 8)
                }
                .frame(width: min(340, proxy.size.width * 0.86))
                .frame(maxHeight: .infinity, alignment: .top)
                .background(.regularMaterial)
                .shadow(color: .black.opacity(0.22), radius: 24, x: 8, y: 0)

                Spacer(minLength: 0)
            }
        }
        .ignoresSafeArea()
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
