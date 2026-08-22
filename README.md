<p align="center"><img src="build/icon.png" width="128" alt="DSH Native terminal icon" /></p>

# DSH Native

[![CI](https://github.com/leonardoxr/dsh-native/actions/workflows/ci.yml/badge.svg)](https://github.com/leonardoxr/dsh-native/actions/workflows/ci.yml)
[![Latest release](https://img.shields.io/github/v/release/leonardoxr/dsh-native?display_name=tag&sort=semver)](https://github.com/leonardoxr/dsh-native/releases/latest)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A focused desktop shell for HTTPS web apps—with saved servers, fast reconnects, and a first-class workflow for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

DSH Native keeps frequently used web apps in a dedicated Electron window: no browser tabs or address bar, just the app you connected to. It remembers multiple servers and opens the most recently used one at launch.

## Highlights

- **Saved server list** — add, name, remove, and switch between HTTPS endpoints.
- **Fast return** — reconnects to the most recently used server on launch and preconnects while the window starts.
- **Focused window** — external links open in the system browser instead of spawning extra app windows.
- **Responsive in the background** — renderer and timer throttling are disabled so long-running apps remain live.
- **Hardened boundary** — remote pages use context isolation with Node.js integration disabled; privileged host-management APIs stay local, and cross-origin navigation opens in the system browser.

## Download

Prebuilt installers and portable packages are published on the [Releases page](https://github.com/leonardoxr/dsh-native/releases):

| Platform | Release artifacts |
| --- | --- |
| Windows x64 | NSIS installer and portable executable |
| macOS Apple silicon | DMG and ZIP |
| Linux x64 | AppImage and Debian package |

macOS releases target Apple silicon (arm64); Intel Macs are not supported.

> [!IMPORTANT]
> Windows binaries are unsigned. Starting with v0.1.1, macOS apps carry an ad-hoc integrity signature but are not Apple Developer ID signed or notarized. SmartScreen or Gatekeeper may therefore require an explicit first launch. Verify the file against the release's `SHA256SUMS.txt`; see [release documentation](docs/RELEASING.md).

### First launch on macOS

After copying DSH Native into Applications, Control-click the app and choose **Open**. If macOS still reports that the app is damaged, first verify the DMG checksum and then clear quarantine from the copied app:

```sh
xattr -dr com.apple.quarantine "/Applications/DSH Native.app"
```

This workaround is necessary only until releases are Developer ID signed and notarized. Never bypass quarantine for an artifact whose checksum does not match.

### Use DSH Native

1. Launch DSH Native.
2. Add a display name and an `https://` URL.
3. Select the server to connect.
4. Use **App → Servers…** or <kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + <kbd>H</kbd> to return to the server list.

Only HTTPS URLs can be saved. Add servers you trust: connected sites run inside the desktop window and retain normal Chromium site storage in DSH Native's per-user application profile. The server list and performance log are stored locally in Electron's `userData` directory.

## DeepSeek Harness companion

When the remote app is a DeepSeek Harness web UI, install [dsh-companion](https://github.com/leonardoxr/dsh-companion), an out-of-tree Harness plugin. It exposes lightweight project and session endpoints so a native client can provide one view across Harness hosts.

If a proxy rewrites the `Host` header—for example, Tailscale Serve—add its public authority to the Harness trust fence:

```sh
dsh web --trusted-host your-host.example.net
```

See the [companion installation guide](https://github.com/leonardoxr/dsh-companion#install) for details.

## Develop locally

### Requirements

- Node.js 22.12 or newer
- npm 10 or newer
- A supported Windows, macOS, or Linux desktop

```sh
git clone https://github.com/leonardoxr/dsh-native.git
cd dsh-native
npm ci
npm start
```

Run the same checks used by CI:

```sh
npm run check
npm test
```

Create an unpacked app for the current platform with `npm run package`, or distributable installers with `npm run dist`. Outputs are written to `dist/`.

### Project layout

```text
src/
├── main.js                 Electron main process and server management
├── preload.js              Context-isolated bridge for the local picker
├── lib/                    Testable URL and navigation security policies
└── renderer/               Bundled server-picker HTML, CSS, and JavaScript
test/                       Node.js unit tests
.github/                    CI, releases, and contribution templates
docs/RELEASING.md           Maintainer release process
```

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request, use the issue templates for bugs and ideas, and follow the [Code of Conduct](CODE_OF_CONDUCT.md).

Please report security issues privately as described in [SECURITY.md](SECURITY.md), not in a public issue.

## Roadmap

- Multi-host tabs that keep connected hosts loaded for instant switching.
- Push badges through forwarded events instead of polling.
- Cold, persisted-only session summaries.
- Signed release binaries and automated update metadata.

## License

[MIT](LICENSE) © 2026 leonardoxr
