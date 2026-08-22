# dsh-native

A native Electron shell for https web apps with a saved server list. Point it at your web app, and it runs in a dedicated desktop window — no browser chrome, no tabs, just your app.

## Features

- **Https-only server list** — saved servers are restricted to `https://` URLs; add, pick, and manage them from a simple built-in UI.
- **Auto-reconnect** — automatically reconnects to the last used server on launch.
- **GPU-accelerated** — hardware acceleration enabled for smooth rendering.
- **No background throttling** — the app keeps running at full speed when unfocused or minimized.

## Getting started

```sh
npm install
npm start
```

Requires Node.js and npm. The first run starts with an empty server list — add your first https server from the app's UI.

## DeepSeek Harness companion plugin

When the remote app is a [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) web UI, install the companion plugin — **[dsh-companion](https://github.com/leonardoxr/dsh-companion)**, an out-of-tree harness plugin — and the shell becomes a cross-host project manager: one window, many Harness hosts, all workspaces and sessions in a single view.

The plugin exposes plain JSON endpoints on the host's webserver — `GET /api/companion/workspaces`, `GET /api/companion/sessions`, and `GET /api/companion/session/<id>` — so a native client can render project/session lists without booting the full web app. See the [plugin README](https://github.com/leonardoxr/dsh-companion#install) for the one-row cordis.yml install.

Serving the UI through a proxy that rewrites the `Host` header (for example Tailscale Serve)? Add your public authority to the trust fence, otherwise API calls get HTTP 403:

```sh
dsh web --trusted-host your-host.example.net
```

### Roadmap

- Multi-host tabs: keep every connected host loaded (not rendered) and switch instantly.
- Push badges via projected forwarded events instead of polling.
- Cold (persisted-only) session summaries.

## Project layout

```
dsh-native/
├── package.json            # App metadata and scripts (npm start → electron .)
├── src/
│   ├── main.js             # Electron main process: window + server list management
│   ├── preload.js          # Context-isolated bridge between main and renderer
│   └── renderer/
│       ├── index.html      # Shell UI: server list and connection screen
│       ├── app.js          # Renderer logic
│       └── styles.css      # Shell styles
```

## License

[MIT](LICENSE) © 2026 leonardoxr
