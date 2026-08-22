import XCTest

@testable import DSHNative

final class ServerURLPolicyTests: XCTestCase {
    func testNormalizesBareHostAsHTTPS() throws {
        let url = try ServerURLPolicy.normalize("  Harness.Example.com  ")
        XCTAssertEqual(url.absoluteString, "https://harness.example.com/")
    }

    func testPreservesPathQueryFragmentAndPort() throws {
        let url = try ServerURLPolicy.normalize("https://example.com:8443/app?q=1#session")
        XCTAssertEqual(url.absoluteString, "https://example.com:8443/app?q=1#session")
    }

    func testRejectsUnsafeOrMalformedURLs() {
        assertPolicyError("", equals: .empty)
        assertPolicyError("http://example.com", equals: .httpsRequired)
        assertPolicyError("file:///tmp/index.html", equals: .httpsRequired)
        assertPolicyError("https:///missing-host", equals: .missingHost)
        assertPolicyError("https://user:secret@example.com", equals: .credentialsNotAllowed)
    }

    func testRemovesExplicitDefaultPort() throws {
        let url = try ServerURLPolicy.normalize("https://example.com:443/app")
        XCTAssertEqual(url.absoluteString, "https://example.com/app")
    }

    func testOriginComparisonUsesEffectivePort() throws {
        let trusted = try ServerURLPolicy.normalize("https://example.com")
        XCTAssertTrue(ServerURLPolicy.isSameOrigin(URL(string: "https://EXAMPLE.com:443/path")!, as: trusted))
        XCTAssertFalse(ServerURLPolicy.isSameOrigin(URL(string: "https://example.com:8443/path")!, as: trusted))
        XCTAssertFalse(ServerURLPolicy.isSameOrigin(URL(string: "https://docs.example.com/path")!, as: trusted))
    }

    func testNavigationRequiresUserActionToExternalizeCrossOrigin() throws {
        let trusted = try ServerURLPolicy.normalize("https://example.com")
        let sameOrigin = URL(string: "https://example.com/projects")!
        let crossOrigin = URL(string: "https://docs.example.com/")!
        let downgraded = URL(string: "http://example.com/")!

        XCTAssertEqual(
            ServerURLPolicy.classifyMainFrameNavigation(
                to: sameOrigin,
                trustedURL: trusted,
                isUserInitiated: false
            ),
            .allow
        )
        XCTAssertEqual(
            ServerURLPolicy.classifyMainFrameNavigation(
                to: crossOrigin,
                trustedURL: trusted,
                isUserInitiated: true
            ),
            .external(crossOrigin)
        )
        XCTAssertEqual(
            ServerURLPolicy.classifyMainFrameNavigation(
                to: crossOrigin,
                trustedURL: trusted,
                isUserInitiated: false
            ),
            .deny
        )
        XCTAssertEqual(
            ServerURLPolicy.classifyMainFrameNavigation(
                to: downgraded,
                trustedURL: trusted,
                isUserInitiated: true
            ),
            .deny
        )
    }

    private func assertPolicyError(
        _ input: String,
        equals expectedError: ServerURLPolicyError,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        XCTAssertThrowsError(try ServerURLPolicy.normalize(input), file: file, line: line) { error in
            XCTAssertEqual(error as? ServerURLPolicyError, expectedError, file: file, line: line)
        }
    }
}
