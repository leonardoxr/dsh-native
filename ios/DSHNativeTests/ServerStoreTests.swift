import Foundation
import XCTest

@testable import DSHNative

@MainActor
final class ServerStoreTests: XCTestCase {
    func testAddConnectSortAndReload() throws {
        let persistence = MemoryServerPersistence()
        var clock = [
            Date(timeIntervalSince1970: 100),
            Date(timeIntervalSince1970: 200),
            Date(timeIntervalSince1970: 300),
            Date(timeIntervalSince1970: 400),
        ]
        let store = ServerStore(persistence: persistence) { clock.removeFirst() }

        let first = try store.upsert(ServerDraft(name: "One", urlText: "one.example.com"))
        let second = try store.upsert(ServerDraft(name: "Two", urlText: "two.example.com"))
        try store.markConnected(id: first.id)
        try store.markConnected(id: second.id)

        XCTAssertEqual(store.orderedServers.map(\.id), [second.id, first.id])
        XCTAssertEqual(store.lastConnectedServerID, second.id)

        let reloaded = ServerStore(persistence: persistence)
        XCTAssertEqual(reloaded.servers.count, 2)
        XCTAssertEqual(reloaded.lastConnectedServerID, second.id)
    }

    func testDuplicateURLIsRejectedTransactionally() throws {
        let persistence = MemoryServerPersistence()
        let store = ServerStore(persistence: persistence)
        _ = try store.upsert(ServerDraft(name: "First", urlText: "https://example.com"))
        let saveCount = persistence.saveCount

        XCTAssertThrowsError(
            try store.upsert(ServerDraft(name: "Duplicate", urlText: "EXAMPLE.com"))
        ) { error in
            guard case ServerStore.StoreError.duplicateURL = error else {
                return XCTFail("Expected duplicateURL, got \(error)")
            }
        }

        XCTAssertEqual(store.servers.count, 1)
        XCTAssertEqual(persistence.saveCount, saveCount)
    }

    func testPersistenceFailureDoesNotPublishMutation() throws {
        let persistence = MemoryServerPersistence()
        let store = ServerStore(persistence: persistence)
        let server = try store.upsert(ServerDraft(name: "Stable", urlText: "stable.example.com"))
        persistence.saveError = TestError.writeFailed

        XCTAssertThrowsError(
            try store.upsert(
                ServerDraft(name: "Changed", urlText: "changed.example.com"),
                id: server.id
            )
        )

        XCTAssertEqual(store.servers.first?.name, "Stable")
        XCTAssertEqual(store.servers.first?.url.absoluteString, "https://stable.example.com/")
    }

    func testCertificateTrustPersistsAndCanBeRevoked() throws {
        let persistence = MemoryServerPersistence()
        let store = ServerStore(persistence: persistence)
        let server = try store.upsert(ServerDraft(name: "Private", urlText: "private.example.com"))
        let fingerprint = ServerURLPolicy.sha256Fingerprint(Data())

        try store.trustCertificate(fingerprint: fingerprint, for: server.id)
        XCTAssertEqual(store.servers.first?.trustedCertificateFingerprint, fingerprint)
        XCTAssertEqual(
            ServerStore(persistence: persistence).servers.first?.trustedCertificateFingerprint,
            fingerprint
        )

        try store.revokeCertificateTrust(for: server.id)
        XCTAssertNil(store.servers.first?.trustedCertificateFingerprint)
    }

    func testDeletingLastConnectedServerClearsReconnectID() throws {
        let persistence = MemoryServerPersistence()
        let store = ServerStore(persistence: persistence)
        let server = try store.upsert(ServerDraft(name: "Delete Me", urlText: "delete.example.com"))
        try store.markConnected(id: server.id)

        try store.delete(id: server.id)

        XCTAssertTrue(store.servers.isEmpty)
        XCTAssertNil(store.lastConnectedServerID)
    }

    func testInvalidPersistedServerIsIgnoredWithWarning() {
        let invalid = SavedServer(
            name: "Unsafe",
            url: URL(string: "http://unsafe.example.com")!
        )
        let persistence = MemoryServerPersistence(
            state: PersistedServerState(servers: [invalid], lastConnectedServerID: invalid.id)
        )

        let store = ServerStore(persistence: persistence)

        XCTAssertTrue(store.servers.isEmpty)
        XCTAssertNil(store.lastConnectedServerID)
        XCTAssertNotNil(store.persistenceMessage)
        XCTAssertEqual(persistence.saveCount, 1)
    }

    func testPersistedServersAreNormalizedDeduplicatedAndCredentialURLsAreRemoved() {
        let canonical = SavedServer(
            name: "Canonical",
            url: URL(string: "https://example.com:443/")!
        )
        let duplicate = SavedServer(
            name: "Duplicate",
            url: URL(string: "https://example.com/")!
        )
        let credentialURL = SavedServer(
            name: "Credentials",
            url: URL(string: "https://user:secret@private.example.com/")!
        )
        let persistence = MemoryServerPersistence(
            state: PersistedServerState(
                servers: [canonical, duplicate, credentialURL],
                lastConnectedServerID: credentialURL.id
            )
        )

        let store = ServerStore(persistence: persistence)

        XCTAssertEqual(store.servers.map(\.id), [canonical.id])
        XCTAssertEqual(store.servers.first?.url.absoluteString, "https://example.com/")
        XCTAssertNil(store.lastConnectedServerID)
        XCTAssertEqual(persistence.saveCount, 1)
    }

    func testFilePersistenceRejectsUnsupportedVersion() throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        defer { try? FileManager.default.removeItem(at: root) }

        let fileURL = root.appendingPathComponent("servers.json")
        let persistence = FileServerPersistence(fileURL: fileURL)
        var futureState = PersistedServerState()
        futureState.version = 99
        try persistence.save(futureState)

        XCTAssertThrowsError(try persistence.load()) { error in
            guard case ServerPersistenceError.unsupportedVersion(99) = error else {
                return XCTFail("Expected unsupported schema error, got \(error)")
            }
        }
        XCTAssertTrue(
            FileManager.default.fileExists(
                atPath: root.appendingPathComponent("servers.corrupt.json").path
            )
        )
    }

    func testFilePersistencePreservesCorruptInput() throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        defer { try? FileManager.default.removeItem(at: root) }
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)

        let fileURL = root.appendingPathComponent("servers.json")
        try Data("not-json".utf8).write(to: fileURL)
        let persistence = FileServerPersistence(fileURL: fileURL)

        XCTAssertThrowsError(try persistence.load())
        XCTAssertTrue(
            FileManager.default.fileExists(
                atPath: root.appendingPathComponent("servers.corrupt.json").path
            )
        )
    }

    func testFilePersistenceRoundTripsState() throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        defer { try? FileManager.default.removeItem(at: root) }

        let persistence = FileServerPersistence(fileURL: root.appendingPathComponent("servers.json"))
        let server = SavedServer(
            name: "Round Trip",
            url: URL(string: "https://roundtrip.example.com/")!,
            createdAt: Date(timeIntervalSince1970: 123)
        )
        let state = PersistedServerState(servers: [server], lastConnectedServerID: server.id)

        try persistence.save(state)
        XCTAssertEqual(try persistence.load(), state)
    }
}

private final class MemoryServerPersistence: ServerPersisting {
    var state: PersistedServerState
    var saveCount = 0
    var saveError: Error?

    init(state: PersistedServerState = PersistedServerState()) {
        self.state = state
    }

    func load() throws -> PersistedServerState {
        state
    }

    func save(_ state: PersistedServerState) throws {
        if let saveError { throw saveError }
        self.state = state
        saveCount += 1
    }
}

private enum TestError: Error {
    case writeFailed
}
