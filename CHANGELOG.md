# Changelog

All notable changes to this project are documented here. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.5.0] - 2026-08-24

### Added

- Native iOS and Android companions with saved-server drawers, responsive mobile browser chrome, and secure WebView sessions.
- Explicit per-server private/self-signed certificate trust: the app shows the host and SHA-256 fingerprint, re-prompts on certificate changes, marks manually trusted sessions, and supports revocation.

### Security

- Manual certificate exceptions remain scoped to one saved HTTPS origin and exact certificate fingerprint; hostname mismatches, expired certificates, invalid certificates, and non-HTTPS navigation remain blocked.
- No pairing, QR provisioning, password proxy, LAN/public tunnel, cloudflared, relay, or JavaScript bridge features are included.

## [0.4.4] - 2026-08-24

### Fixed

- Show immediate accessible feedback while checking for updates instead of leaving the Check action visually silent.

## [0.4.3] - 2026-08-24

### Fixed

- Launch the Windows npm `dsh.cmd` shim through `cmd.exe` to avoid `spawn EINVAL`, while keeping direct `dsh` execution on macOS and Linux.

## [0.4.2] - 2026-08-24

### Fixed

- Publish exactly the documented release artifacts, excluding electron-builder debug metadata and unused macOS blockmaps from the upload bundle.

## [0.4.1] - 2026-08-24

### Fixed

- Keep active Companion and Tailscale timeout handles referenced until their stalled operations settle, preventing Linux release validation from exiting with cancelled tests.

## [0.4.0] - 2026-08-24

### Added

- Self-updating desktop app, modeled on T3 Code's updater: automatic feed checks shortly after launch and every 30 minutes, with download and install strictly behind explicit user actions.
- Updates card in the Workspaces home showing live status, download progress, sanitized release notes, and a stable/pre-release channel switcher persisted across launches.
- Restart-to-update flow that gracefully stops the managed local DSH instance before silently installing the pending build and relaunching.
- Precise disabled states instead of silent failures: portable Windows builds, Linux .deb installs, unsigned macOS bundles, development checkouts, and `DSH_NATIVE_DISABLE_AUTO_UPDATE` all explain why updates are unavailable.
- Updater feed manifests (`latest.yml`, `latest-mac.yml`, `latest-linux.yml`) and the Windows blockmap are now published with each release so installed apps can find new versions.

### Changed

- Restore Chromium's normal background throttling and occlusion handling on macOS; hidden remote pages no longer run at full renderer/timer rate while the main-process notification feed stays live.
- Pause Workspaces refresh and age timers while the window is hidden, and update visible ages in place instead of rebuilding the dashboard DOM.
- Reconcile dashboard rows by key so stable workspace, session, and server elements retain focus and event handlers across refreshes.
- Cache Tailscale Companion probes per peer for five minutes and probe only new or expired candidates, while refreshing online labels from memoized Tailscale status.
- Move workspace-cache and performance-log writes off the main-process hot path, coalesce them, and avoid disk writes when content is unchanged.

### Fixed

- Back off repeated failed local DSH Web launches for five minutes during automatic dashboard refreshes; an explicit Open action still retries immediately.
- Preserve server rename input while periodic dashboard updates occur.

## [0.2.0] - 2026-08-24

### Added

- Unified multi-server Workspace Home aggregating workspaces and live sessions from every saved server plus the managed local instance into one most-recent-first dashboard.
- Per-server connection states with distinct Not authorized, No Companion, and Offline (tailnet) diagnostics and remediation hints.
- Cached last-good snapshots per server for an instant dashboard paint, with age-labeled stale rows and live-always-wins refreshes.
- Tailscale discovery: responsive tailnet peers running DSH are probed and offered as one-click MagicDNS HTTPS server additions.
- Workspaces… menu action with Ctrl/Cmd+H returning to the aggregated dashboard from any connected server.
- Native SwiftUI companion for iPhone and iPad with a saved HTTPS host picker and governed WebKit shell.
- Deterministic iOS URL, navigation, persistence, and state tests plus reusable local-Mac SSH build scripts.
- iOS privacy manifest, launch experience, original app icon, app-switcher privacy cover, and clear website-data controls.

### Fixed

- Register the shared presentation library in the Workspaces renderer so dashboard lists render instead of staying empty.
- Treat an already-serving port 3080 as ready instead of failing managed local startup while another DSH Web instance answers.
- Launch `dsh web` with --no-open so the managed instance no longer opens a duplicate system-browser tab.

### Security

- Keep iOS remote content behind normal WebKit and system TLS checks with no JavaScript-to-native bridge.
- Block automatic cross-origin main-frame navigation and open only user-activated safe external links.
- Companion fetching and hosts access remain main-process-only behind the exact-frame sender guard; remote pages gain no privileged access.
- Saved server addressing stays HTTPS-only, including MagicDNS URLs discovered on a tailnet.

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

[Unreleased]: https://github.com/leonardoxr/dsh-native/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/leonardoxr/dsh-native/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/leonardoxr/dsh-native/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/leonardoxr/dsh-native/releases/tag/v0.1.0
