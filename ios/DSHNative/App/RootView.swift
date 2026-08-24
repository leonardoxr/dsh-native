import SwiftUI

struct RootView: View {
    @ObservedObject var store: ServerStore

    @State private var activeServerID: UUID?
    @State private var restoredLastServer = false

    private var activeServer: SavedServer? {
        guard let activeServerID else { return nil }
        return store.servers.first { $0.id == activeServerID }
    }

    var body: some View {
        Group {
            if let activeServer {
                BrowserScreen(
                    server: activeServer,
                    store: store,
                    onSelectServer: { server in connect(to: server) },
                    onShowServers: { activeServerID = nil }
                )
                .id(activeServer.id)
            } else {
                ServerListView(store: store) { server in
                    connect(to: server)
                }
            }
        }
        .onAppear {
            guard !restoredLastServer else { return }
            restoredLastServer = true
            activeServerID = store.lastConnectedServer?.id
        }
        .onChange(of: store.servers) { _, servers in
            if let activeServerID,
                !servers.contains(where: { $0.id == activeServerID })
            {
                self.activeServerID = nil
            }
        }
    }

    private func connect(to server: SavedServer) {
        do {
            try store.markConnected(id: server.id)
            activeServerID = server.id
        } catch {
            store.persistenceMessage = error.localizedDescription
        }
    }
}
