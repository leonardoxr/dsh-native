import Foundation

enum ServerPersistenceError: LocalizedError {
    case unsupportedVersion(Int)

    var errorDescription: String? {
        switch self {
        case .unsupportedVersion(let version):
            return "Saved server data uses unsupported schema version \(version)."
        }
    }
}

struct PersistedServerState: Codable, Equatable {
    static let currentVersion = 1

    var version = currentVersion
    var servers: [SavedServer] = []
    var lastConnectedServerID: UUID?
}

protocol ServerPersisting: AnyObject {
    func load() throws -> PersistedServerState
    func save(_ state: PersistedServerState) throws
}

final class FileServerPersistence: ServerPersisting {
    private let fileURL: URL
    private let fileManager: FileManager

    init(fileURL: URL? = nil, fileManager: FileManager = .default) {
        self.fileManager = fileManager

        if let fileURL {
            self.fileURL = fileURL
        } else {
            let root = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
            let appDirectory = root.appendingPathComponent("DSHNative", isDirectory: true)
            self.fileURL = appDirectory.appendingPathComponent("servers.json", isDirectory: false)
        }
    }

    func load() throws -> PersistedServerState {
        guard fileManager.fileExists(atPath: fileURL.path) else {
            return PersistedServerState()
        }

        let data = try Data(contentsOf: fileURL)
        do {
            let state = try JSONDecoder().decode(PersistedServerState.self, from: data)
            guard state.version == PersistedServerState.currentVersion else {
                throw ServerPersistenceError.unsupportedVersion(state.version)
            }
            return state
        } catch {
            let backupURL =
                fileURL
                .deletingPathExtension()
                .appendingPathExtension("corrupt.json")
            try? fileManager.removeItem(at: backupURL)
            try? fileManager.copyItem(at: fileURL, to: backupURL)
            throw error
        }
    }

    func save(_ state: PersistedServerState) throws {
        try fileManager.createDirectory(
            at: fileURL.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )

        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        let data = try encoder.encode(state)
        try data.write(to: fileURL, options: [.atomic, .completeFileProtectionUnlessOpen])
    }
}
