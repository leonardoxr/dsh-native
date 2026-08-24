import Combine
import Foundation

@MainActor
final class ServerStore: ObservableObject {
    enum StoreError: LocalizedError {
        case nameRequired
        case duplicateURL
        case serverNotFound
        case persistenceFailed(Error)

        var errorDescription: String? {
            switch self {
            case .nameRequired:
                return "Give this server a name."
            case .duplicateURL:
                return "That server is already in your list."
            case .serverNotFound:
                return "The selected server no longer exists."
            case .persistenceFailed:
                return "DSH Native could not save your server list."
            }
        }
    }

    @Published private(set) var servers: [SavedServer]
    @Published private(set) var lastConnectedServerID: UUID?
    @Published var persistenceMessage: String?

    private let persistence: ServerPersisting
    private let now: () -> Date

    init(
        persistence: ServerPersisting = FileServerPersistence(),
        now: @escaping () -> Date = Date.init
    ) {
        self.persistence = persistence
        self.now = now

        do {
            let state = try persistence.load()
            guard state.version == PersistedServerState.currentVersion else {
                throw ServerPersistenceError.unsupportedVersion(state.version)
            }

            var seenURLs = Set<String>()
            var validServers: [SavedServer] = []
            for var server in state.servers {
                guard let normalizedURL = try? ServerURLPolicy.normalize(server.url.absoluteString),
                    seenURLs.insert(normalizedURL.absoluteString).inserted
                else {
                    continue
                }
                server.url = normalizedURL
                if let fingerprint = server.trustedCertificateFingerprint,
                    !ServerURLPolicy.isSHA256Fingerprint(fingerprint)
                {
                    server.trustedCertificateFingerprint = nil
                }
                validServers.append(server)
            }

            let validLastID = state.lastConnectedServerID.flatMap { candidate in
                validServers.contains(where: { $0.id == candidate }) ? candidate : nil
            }
            servers = validServers
            lastConnectedServerID = validLastID

            if validServers != state.servers || validLastID != state.lastConnectedServerID {
                persistenceMessage = "Invalid or duplicate saved servers were removed."
                do {
                    try persistence.save(
                        PersistedServerState(servers: validServers, lastConnectedServerID: validLastID)
                    )
                } catch {
                    persistenceMessage = "Invalid saved servers were ignored, but the repaired list could not be saved."
                }
            }
        } catch {
            servers = []
            lastConnectedServerID = nil
            persistenceMessage = "Your saved servers could not be loaded. A new list has been started."
        }
    }

    var orderedServers: [SavedServer] {
        servers.sorted { lhs, rhs in
            switch (lhs.lastUsedAt, rhs.lastUsedAt) {
            case (let left?, let right?) where left != right:
                return left > right
            case (_?, nil):
                return true
            case (nil, _?):
                return false
            default:
                return lhs.name.localizedCaseInsensitiveCompare(rhs.name) == .orderedAscending
            }
        }
    }

    var lastConnectedServer: SavedServer? {
        guard let lastConnectedServerID else { return nil }
        return servers.first { $0.id == lastConnectedServerID }
    }

    @discardableResult
    func upsert(_ draft: ServerDraft, id: UUID? = nil) throws -> SavedServer {
        let name = draft.name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { throw StoreError.nameRequired }

        let normalizedURL = try ServerURLPolicy.normalize(draft.urlText)
        if servers.contains(where: { $0.id != id && $0.url == normalizedURL }) {
            throw StoreError.duplicateURL
        }

        var nextServers = servers
        let savedServer: SavedServer

        if let id {
            guard let index = nextServers.firstIndex(where: { $0.id == id }) else {
                throw StoreError.serverNotFound
            }
            if nextServers[index].url != normalizedURL {
                nextServers[index].trustedCertificateFingerprint = nil
            }
            nextServers[index].name = name
            nextServers[index].url = normalizedURL
            savedServer = nextServers[index]
        } else {
            savedServer = SavedServer(name: name, url: normalizedURL, createdAt: now())
            nextServers.append(savedServer)
        }

        try commit(servers: nextServers, lastConnectedServerID: lastConnectedServerID)
        return savedServer
    }

    func delete(id: UUID) throws {
        let nextServers = servers.filter { $0.id != id }
        let nextLastID = lastConnectedServerID == id ? nil : lastConnectedServerID
        try commit(servers: nextServers, lastConnectedServerID: nextLastID)
    }

    func trustCertificate(fingerprint: String, for id: UUID) throws {
        guard ServerURLPolicy.isSHA256Fingerprint(fingerprint),
            let index = servers.firstIndex(where: { $0.id == id })
        else {
            throw StoreError.serverNotFound
        }

        var nextServers = servers
        nextServers[index].trustedCertificateFingerprint = fingerprint
        try commit(servers: nextServers, lastConnectedServerID: lastConnectedServerID)
    }

    func revokeCertificateTrust(for id: UUID) throws {
        guard let index = servers.firstIndex(where: { $0.id == id }) else {
            throw StoreError.serverNotFound
        }

        var nextServers = servers
        nextServers[index].trustedCertificateFingerprint = nil
        try commit(servers: nextServers, lastConnectedServerID: lastConnectedServerID)
    }

    func markConnected(id: UUID) throws {
        guard let index = servers.firstIndex(where: { $0.id == id }) else {
            throw StoreError.serverNotFound
        }

        var nextServers = servers
        nextServers[index].lastUsedAt = now()
        try commit(servers: nextServers, lastConnectedServerID: id)
    }

    private func commit(servers: [SavedServer], lastConnectedServerID: UUID?) throws {
        let state = PersistedServerState(
            servers: servers,
            lastConnectedServerID: lastConnectedServerID
        )

        do {
            try persistence.save(state)
            self.servers = servers
            self.lastConnectedServerID = lastConnectedServerID
        } catch {
            throw StoreError.persistenceFailed(error)
        }
    }
}
