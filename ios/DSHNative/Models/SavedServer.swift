import Foundation

struct SavedServer: Codable, Equatable, Identifiable {
    let id: UUID
    var name: String
    var url: URL
    var createdAt: Date
    var lastUsedAt: Date?
    var trustedCertificateFingerprint: String?

    init(
        id: UUID = UUID(),
        name: String,
        url: URL,
        createdAt: Date = Date(),
        lastUsedAt: Date? = nil,
        trustedCertificateFingerprint: String? = nil
    ) {
        self.id = id
        self.name = name
        self.url = url
        self.createdAt = createdAt
        self.lastUsedAt = lastUsedAt
        self.trustedCertificateFingerprint = trustedCertificateFingerprint
    }

    var displayHost: String {
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
            let host = components.host
        else {
            return url.absoluteString
        }

        if let port = components.port, port != 443 {
            return "\(host):\(port)"
        }
        return host
    }
}

struct ServerDraft: Equatable {
    var name: String = ""
    var urlText: String = ""

    init(name: String = "", urlText: String = "") {
        self.name = name
        self.urlText = urlText
    }

    init(server: SavedServer) {
        name = server.name
        urlText = server.url.absoluteString
    }
}
