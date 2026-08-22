'use strict'
const bootStart = performance.now()

const { app, BrowserWindow, ipcMain, Menu, Notification, shell } = require('electron')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const fs = require('node:fs')
const crypto = require('node:crypto')
const { normalizeUrl } = require('./lib/normalize-url')
const { classifyNavigation } = require('./lib/navigation-policy')
const { NotificationFeed } = require('./lib/notification-feed')
const { createNotificationPresenter } = require('./lib/notification-presenter')

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

if (process.platform === 'win32') app.setAppUserModelId('dev.leonardoxr.dshnative')

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

const pickerUrl = pathToFileURL(path.join(__dirname, 'renderer', 'index.html')).href
const trustedOrigins = new WeakMap()

let mainWindow = null
let notificationFeed = null

const presentNotification = createNotificationPresenter({
  Notification,
  getWindow: () => mainWindow,
})

function loadPicker(win) {
  notificationFeed?.stop()
  trustedOrigins.delete(win)
  void win.loadFile(path.join(__dirname, 'renderer', 'index.html'))
}

function loadHost(win, targetUrl) {
  const normalized = normalizeUrl(targetUrl)
  if (!normalized) return false

  trustedOrigins.set(win, new URL(normalized).origin)
  notificationFeed?.start(normalized, win.webContents.session.fetch.bind(win.webContents.session))
  // Warm the TLS/TCP sockets while the window and renderer spin up.
  win.webContents.session.preconnect({ url: normalized, numSockets: 2 })
  void win.loadURL(normalized)
  return true
}

function guardNavigation(win, event, targetUrl) {
  const decision = classifyNavigation(trustedOrigins.get(win), targetUrl)
  if (decision.action === 'allow') return

  event.preventDefault()
  if (decision.action === 'external') void shell.openExternal(decision.url)
}

function createWindow(targetUrl) {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    // Paint fully before revealing: no white flash on launch or navigation.
    show: false,
    backgroundColor: '#1f1f1f',
    webPreferences: {
      // Never throttle this window's own rendering when hidden.
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
      spellcheck: false,
    },
  })

  // Keep remote content on the selected HTTPS origin. Cross-origin destinations
  // open in the system browser, where the address and certificate are visible.
  win.webContents.on('will-navigate', (event, url) => guardNavigation(win, event, url))
  win.webContents.on('will-redirect', (event, url) => guardNavigation(win, event, url))
  win.webContents.setWindowOpenHandler(({ url }) => {
    const externalUrl = normalizeUrl(url)
    if (externalUrl) void shell.openExternal(externalUrl)
    return { action: 'deny' }
  })

  win.once('ready-to-show', () => {
    win.show()
    perfLog(`first paint ready in ${(performance.now() - bootStart).toFixed(0)}ms`)
  })

  if (!targetUrl || !loadHost(win, targetUrl)) loadPicker(win)

  win.webContents.once('did-finish-load', () => {
    perfLog(`page loaded in ${(performance.now() - bootStart).toFixed(0)}ms`)
  })
  win.once('closed', () => {
    notificationFeed?.stop()
    if (mainWindow === win) mainWindow = null
  })
  return win
}

function showHome() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    loadPicker(mainWindow)
  } else {
    mainWindow = createWindow(null)
  }
}

app.whenReady().then(() => {
  notificationFeed = new NotificationFeed({ onNotification: presentNotification })

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

app.on('before-quit', () => notificationFeed?.stop())

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// --- IPC: host list management -------------------------------------------

function requirePicker(event) {
  if (event.senderFrame.url !== pickerUrl) {
    throw new Error('Host management is available only from the local server picker.')
  }
}

ipcMain.handle('hosts:list', (event) => {
  requirePicker(event)
  return getHosts()
})

ipcMain.handle('hosts:add', (event, { name, url }) => {
  requirePicker(event)
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

ipcMain.handle('hosts:remove', (event, id) => {
  requirePicker(event)
  saveHosts(getHosts().filter((h) => h.id !== id))
})

ipcMain.handle('hosts:connect', (event, id) => {
  requirePicker(event)
  const host = getHosts().find((h) => h.id === id)
  if (!host) throw new Error('Unknown server.')
  host.lastUsedAt = Date.now()
  saveHosts([host, ...getHosts().filter((h) => h.id !== host.id)])

  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win || !loadHost(win, host.url)) throw new Error('The saved server URL is invalid.')
})


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


