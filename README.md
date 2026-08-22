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
