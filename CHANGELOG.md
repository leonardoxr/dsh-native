# Changelog

All notable changes to this project are documented here. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.1] - 2026-08-22

### Fixed

- Ad-hoc sign the Apple silicon macOS application before packaging so the bundle has a valid integrity signature.
- Verify macOS signatures in the release workflow and document the remaining Gatekeeper behavior.

## [0.1.0] - 2026-08-22

### Added

- Initial Electron shell with a persistent HTTPS server list and automatic reconnection.
- Cross-platform packaging for Windows, macOS, and Linux.
- Tag-driven GitHub release automation with SHA-256 checksums.
- Custom application icon and DeepSeek Harness companion documentation.
- CI checks, unit tests, contributor guidance, security policy, and issue templates.

### Security

- Remote pages run with context isolation and without Node.js integration.
- Privileged host-management IPC is limited to the bundled local server picker.

[Unreleased]: https://github.com/leonardoxr/dsh-native/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/leonardoxr/dsh-native/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/leonardoxr/dsh-native/releases/tag/v0.1.0
