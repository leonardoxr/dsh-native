import Foundation

enum ServerURLPolicyError: LocalizedError, Equatable {
    case empty
    case httpsRequired
    case missingHost
    case credentialsNotAllowed

    var errorDescription: String? {
        switch self {
        case .empty:
            return "Enter a server address."
        case .httpsRequired:
            return "The server must use HTTPS."
        case .missingHost:
            return "Enter a valid server hostname."
        case .credentialsNotAllowed:
            return "Put credentials in the server’s sign-in page, not in its URL."
        }
    }
}

struct WebOrigin: Equatable {
    let scheme: String
    let host: String
    let port: Int

    init?(url: URL) {
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
            components.scheme?.lowercased() == "https",
            let host = components.host?.lowercased(),
            !host.isEmpty
        else {
            return nil
        }

        scheme = "https"
        self.host = host
        port = components.port ?? 443
    }
}

enum MainFrameNavigationDecision: Equatable {
    case allow
    case external(URL)
    case deny
}

enum ServerURLPolicy {
    static func normalize(_ input: String) throws -> URL {
        let trimmed = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { throw ServerURLPolicyError.empty }

        let candidate = trimmed.contains("://") ? trimmed : "https://\(trimmed)"
        guard var components = URLComponents(string: candidate) else {
            throw ServerURLPolicyError.missingHost
        }

        guard components.scheme?.lowercased() == "https" else {
            throw ServerURLPolicyError.httpsRequired
        }
        guard let host = components.host, !host.isEmpty else {
            throw ServerURLPolicyError.missingHost
        }
        guard components.user == nil, components.password == nil else {
            throw ServerURLPolicyError.credentialsNotAllowed
        }

        components.scheme = "https"
        components.host = host.lowercased()
        if components.port == 443 {
            components.port = nil
        }
        if components.path.isEmpty {
            components.path = "/"
        }

        guard let url = components.url, WebOrigin(url: url) != nil else {
            throw ServerURLPolicyError.missingHost
        }
        return url
    }

    static func isSameOrigin(_ candidate: URL, as trustedURL: URL) -> Bool {
        guard let candidateOrigin = WebOrigin(url: candidate),
            let trustedOrigin = WebOrigin(url: trustedURL)
        else {
            return false
        }
        return candidateOrigin == trustedOrigin
    }

    static func classifyMainFrameNavigation(
        to candidate: URL,
        trustedURL: URL,
        isUserInitiated: Bool
    ) -> MainFrameNavigationDecision {
        if isSameOrigin(candidate, as: trustedURL) {
            return .allow
        }
        if isUserInitiated, mayOpenExternally(candidate) {
            return .external(candidate)
        }
        return .deny
    }

    static func mayOpenExternally(_ url: URL) -> Bool {
        guard let scheme = url.scheme?.lowercased() else { return false }
        return ["https", "mailto", "tel", "sms"].contains(scheme)
    }
}
