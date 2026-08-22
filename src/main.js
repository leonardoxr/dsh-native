'use strict'
const bootStart = performance.now()

const { app, BrowserWindow, ipcMain, Menu, shell } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const crypto = require('node:crypto')

// Keep rendering and timers at full rate even when the window is occluded or
// minimized: the app must stay live and snap back instantly. Switches must be
// appended before app ready.

// Perf diagnostics land in userData so they survive GUI stdout detachment on Windows.
function perfLog(message) {
  const line = `[perf] ${message}`
  console.log(line)
  try {
    fs.mkdirSync(app.getPath('userData'), { recursive: true })
    fs.appendFileSync(path.join(app.getPath('userData'), 'perf.log'), `${new Date().toISOString()} ${line}\n`)
  } catch {
    // userData may not exist yet during very early boot; console output still has it.
  }
}

for (const flag of [
  'disable-renderer-backgrounding',
  'disable-background-timer-throttling',
  'disable-backgrounding-occluded-windows',
]) {
  app.commandLine.appendSwitch(flag)
}

/** Persisted server list: [{ id, name, url, lastUsedAt }] */
const hostsFile = () => path.join(app.getPath('userData'), 'hosts.json')

let hostsCache = null

function getHosts() {
  hostsCache ??= (() => {
    try {
      return JSON.parse(fs.readFileSync(hostsFile(), 'utf8'))
    } catch {
      // Missing or unreadable file: start with the default empty list.
      return []
    }
  })()
  return hostsCache
}

function saveHosts(hosts) {
  hostsCache = hosts
  fs.mkdirSync(path.dirname(hostsFile()), { recursive: true })
  fs.writeFileSync(hostsFile(), JSON.stringify(hosts, null, 2))
}

/**
 * Only https URLs are accepted for now.
 * @param {string} input
 * @returns {string | null} normalized URL, or null when invalid
 */
function normalizeUrl(input) {
  try {
    const url = new URL(input.trim())
    if (url.protocol !== 'https:') return null
    return url.toString()
  } catch {
    return null
  }
}

let mainWindow = null

function createWindow(targetUrl) {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    // Paint fully before revealing: no white flash on launch or navigation.
    show: false,
    backgroundColor: '#1f1f1f',
    webPreferences: {
      spellcheck: false,
      // Never throttle this window's own rendering when hidden.
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  })

  // Open target=_blank / window.open in the OS browser instead of a new Electron window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) shell.openExternal(url)
    return { action: 'deny' }
  })

  win.once('ready-to-show', () => {
    win.show()
    perfLog(`first paint ready in ${(performance.now() - bootStart).toFixed(0)}ms`)
  })

  if (targetUrl) {
    // Warm the TLS/TCP sockets while the window and renderer spin up.
    win.webContents.session.preconnect({ url: targetUrl, numSockets: 2 })
    win.loadURL(targetUrl)
  } else {
    win.loadFile(path.join(__dirname, 'renderer', 'index.html'))
  }

  win.webContents.once('did-finish-load', () => {
    perfLog(`page loaded in ${(performance.now() - bootStart).toFixed(0)}ms`)
  })
  return win
}


function showHome() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'))
  } else {
    mainWindow = createWindow(null)
  }
}

app.whenReady().then(() => {
  const mostRecent = getHosts()
    .slice()
    .sort((a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0))[0]

  mainWindow = createWindow(mostRecent ? mostRecent.url : null)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) showHome()
  })
  perfLog(`gpu: ${JSON.stringify(app.getGPUFeatureStatus())}`)
  // The feature status can be stale before the GPU process initializes.
  app.on('gpu-info-update', () => {
    perfLog(`gpu update: ${JSON.stringify(app.getGPUFeatureStatus())}`)
  })
  setTimeout(() => {
    perfLog(`gpu settled: ${JSON.stringify(app.getGPUFeatureStatus())}`)
  }, 5000)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// --- IPC: host list management -------------------------------------------

ipcMain.handle('hosts:list', () => getHosts())

ipcMain.handle('hosts:add', (_event, { name, url }) => {
  const normalized = normalizeUrl(url)
  if (!normalized) throw new Error('Only valid https:// URLs are supported.')
  const hosts = getHosts()
  const existing = hosts.find((h) => h.url === normalized)
  if (existing) {
    existing.name = name || existing.name
    saveHosts(hosts)
    return existing
  }
  const host = {
    id: crypto.randomUUID(),
    name: name || new URL(normalized).host,
    url: normalized,
    lastUsedAt: 0,
  }
  hosts.push(host)
  saveHosts(hosts)
  return host
})

ipcMain.handle('hosts:remove', (_event, id) => {
  saveHosts(getHosts().filter((h) => h.id !== id))
})

ipcMain.handle('hosts:connect', (event, id) => {
  const host = getHosts().find((h) => h.id === id)
  if (!host) throw new Error('Unknown server.')
  host.lastUsedAt = Date.now()
  saveHosts([host, ...getHosts().filter((h) => h.id !== host.id)])

  const win = BrowserWindow.fromWebContents(event.sender)
  win.loadURL(host.url)
})

ipcMain.handle('app:goHome', () => showHome())

// Minimal menu so users can always get back to the server list.
Menu.setApplicationMenu(
  Menu.buildFromTemplate([
    {
      label: 'App',
      submenu: [
        { label: 'Servers…', accelerator: 'CmdOrCtrl+H', click: () => showHome() },
        { type: 'separator' },
        process.platform === 'darwin'
          ? { role: 'quit' }
          : { role: 'close' },
      ],
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
  ]),
)


