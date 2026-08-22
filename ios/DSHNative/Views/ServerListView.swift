import SwiftUI
import WebKit

struct ServerListView: View {
    @ObservedObject var store: ServerStore
    let onConnect: (SavedServer) -> Void

    @Environment(\.openURL) private var openURL
    @State private var editorServer: SavedServer?
    @State private var showingNewServer = false
    @State private var pendingDeletion: SavedServer?
    @State private var showingClearWebData = false
    @State private var webDataMessage: String?

    var body: some View {
        NavigationStack {
            Group {
                if store.orderedServers.isEmpty {
                    emptyState
                } else {
                    serverList
                }
            }
            .navigationTitle("Servers")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Menu {
                        Button {
                            showingClearWebData = true
                        } label: {
                            Label("Clear Website Data", systemImage: "eraser")
                        }

                        Link(destination: URL(string: "https://github.com/leonardoxr/dsh-native")!) {
                            Label("Project on GitHub", systemImage: "safari")
                        }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                    }
                    .accessibilityLabel("More options")
                }

                ToolbarItem(placement: .primaryAction) {
                    Button {
                        showingNewServer = true
                    } label: {
                        Label("Add Server", systemImage: "plus")
                    }
                }
            }
            .safeAreaInset(edge: .bottom) {
                securityFooter
            }
        }
        .sheet(isPresented: $showingNewServer) {
            ServerEditorView(server: nil, store: store)
        }
        .sheet(item: $editorServer) { server in
            ServerEditorView(server: server, store: store)
        }
        .confirmationDialog(
            "Remove \(pendingDeletion?.name ?? "server")?",
            isPresented: deletionBinding,
            titleVisibility: .visible
        ) {
            Button("Remove Server", role: .destructive, action: deletePendingServer)
            Button("Cancel", role: .cancel) { pendingDeletion = nil }
        } message: {
            Text("The saved entry will be removed. Website cookies and storage are cleared separately.")
        }
        .confirmationDialog(
            "Clear all website data?",
            isPresented: $showingClearWebData,
            titleVisibility: .visible
        ) {
            Button("Clear Website Data", role: .destructive) {
                Task { await clearWebsiteData() }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text(
                "This signs you out of every server and removes WebKit cookies, caches, and local storage. Your server list stays intact."
            )
        }
        .alert("DSH Native", isPresented: messageBinding) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(store.persistenceMessage ?? webDataMessage ?? "")
        }
    }

    private var serverList: some View {
        List {
            Section {
                ForEach(store.orderedServers) { server in
                    Button {
                        onConnect(server)
                    } label: {
                        ServerRow(server: server)
                    }
                    .buttonStyle(.plain)
                    .contextMenu {
                        Button {
                            onConnect(server)
                        } label: {
                            Label("Connect", systemImage: "arrow.up.right.square")
                        }

                        Button {
                            editorServer = server
                        } label: {
                            Label("Edit", systemImage: "pencil")
                        }

                        Button {
                            openURL(server.url)
                        } label: {
                            Label("Open in Safari", systemImage: "safari")
                        }

                        Button(role: .destructive) {
                            pendingDeletion = server
                        } label: {
                            Label("Remove", systemImage: "trash")
                        }
                    }
                    .swipeActions(edge: .trailing) {
                        Button(role: .destructive) {
                            pendingDeletion = server
                        } label: {
                            Label("Remove", systemImage: "trash")
                        }

                        Button {
                            editorServer = server
                        } label: {
                            Label("Edit", systemImage: "pencil")
                        }
                        .tint(Color("AccentColor"))
                    }
                    .accessibilityAction(named: "Edit Server") {
                        editorServer = server
                    }
                    .accessibilityAction(named: "Open in Safari") {
                        openURL(server.url)
                    }
                    .accessibilityAction(named: "Remove Server") {
                        pendingDeletion = server
                    }
                }
            } header: {
                Text("Trusted HTTPS Hosts")
            }
        }
        .listStyle(.insetGrouped)
    }

    private var emptyState: some View {
        ContentUnavailableView {
            Label("No Servers Yet", systemImage: "server.rack")
        } description: {
            Text("Add the HTTPS address of a DeepSeek Harness or another web app you trust.")
        } actions: {
            Button {
                showingNewServer = true
            } label: {
                Label("Add Your First Server", systemImage: "plus")
            }
            .buttonStyle(.borderedProminent)
        }
    }

    private var securityFooter: some View {
        HStack(spacing: 8) {
            Image(systemName: "lock.shield.fill")
                .foregroundStyle(Color("AccentColor"))
            Text("Remote pages stay inside WebKit. Top-level cross-origin links open in Safari.")
                .font(.caption)
                .foregroundStyle(.secondary)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 10)
        .background(.bar)
    }

    private var deletionBinding: Binding<Bool> {
        Binding(
            get: { pendingDeletion != nil },
            set: { if !$0 { pendingDeletion = nil } }
        )
    }

    private var messageBinding: Binding<Bool> {
        Binding(
            get: { store.persistenceMessage != nil || webDataMessage != nil },
            set: { isPresented in
                if !isPresented {
                    store.persistenceMessage = nil
                    webDataMessage = nil
                }
            }
        )
    }

    private func deletePendingServer() {
        guard let pendingDeletion else { return }
        defer { self.pendingDeletion = nil }

        do {
            try store.delete(id: pendingDeletion.id)
        } catch {
            store.persistenceMessage = error.localizedDescription
        }
    }

    private func clearWebsiteData() async {
        let dataStore = WKWebsiteDataStore.default()
        await withCheckedContinuation { continuation in
            dataStore.removeData(
                ofTypes: WKWebsiteDataStore.allWebsiteDataTypes(),
                modifiedSince: .distantPast
            ) {
                continuation.resume()
            }
        }
        webDataMessage = "Website data was cleared."
    }
}
