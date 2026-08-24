'use strict'
const bootStart = performance.now()

const { app, BrowserWindow, ipcMain, Menu, Notification, shell } = require('electron')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const fs = require('node:fs')
const crypto = require('node:crypto')
const { normalizeUrl } = require('./lib/normalize-url')
const { LOCAL_DSH_URL, requestReady, startLocalDsh, stopLocalDsh, waitForDsh } = require('./lib/local-dsh')
const { classifyNavigation } = require('./lib/navigation-policy')
const { NotificationFeed } = require('./lib/notification-feed')
const { createNotificationPresenter } = require('./lib/notification-presenter')
const { assertHomeSender } = require('./lib/home-sender')
const { fetchCompanionServerData, probeCandidates, isConnectivityFailure } = require('./lib/companion-client')
const { aggregateServers } = require('./lib/workspace-aggregator')
const { readTailscaleStatus, findPeerForHost, magicDnsHttpsUrl } = require('./lib/tailscale')
const { createUpdater } = require('./lib/updater')
const { isAllowedChannel } = require('./lib/update-channels')

// Keep rendering and timers at full rate even when the window is occluded or
// minimized: the app must stay live and snap back instantly. Switches must be
// appended before app ready.

// Perf diagnostics land in userData so they survive GUI stdout detachment on Windows.
function perfLog(message) {
  const line = '[perf] ' + message
  console.log(line)
  try {
    fs.mkdirSync(app.getPath('userData'), { recursive: true })
    fs.appendFileSync(path.join(app.getPath('userData'), 'perf.log'), new Date().toISOString() + ' ' + line + '\n')
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

// --- Self-update settings ----------------------------------------------------

const updateSettingsFile = () => path.join(app.getPath('userData'), 'update-settings.json')

function getStoredUpdateChannel() {
  try {
    const raw = JSON.parse(fs.readFileSync(updateSettingsFile(), 'utf8'))
    return typeof raw.channel === 'string' ? raw.channel : null
  } catch {
    // Missing or unreadable file falls back to the version-derived channel.
    return null
  }
}

function saveStoredUpdateChannel(channel) {
  try {
    fs.mkdirSync(path.dirname(updateSettingsFile()), { recursive: true })
    fs.writeFileSync(updateSettingsFile(), JSON.stringify({ channel }, null, 2))
  } catch (error) {
    perfLog('update channel persist failed: ' + error.message)
  }
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

// --- Workspaces dashboard state ---------------------------------------------

const LOCAL_HOST_ID = 'local'
const WORKSPACE_CACHE_FILE = () => path.join(app.getPath('userData'), 'workspace-cache.json')
const WORKSPACE_CACHE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000
const TAILNET_MEMO_MS = 15000
const TAILNET_SUGGESTION_LIMIT = 24
const REFRESH_TIMEOUT_MS = 5000
const LOCAL_REFRESH_START_TIMEOUT_MS = 8000
const LOCAL_CONNECT_TIMEOUT_MS = 30000

let workspaceCache = null
let tailnetMemo = null
let lastTailnetSuggestions = { available: false, peers: [] }
let refreshPromise = null

function localHostEntry() {
  return { id: LOCAL_HOST_ID, name: 'This computer', url: LOCAL_DSH_URL, lastUsedAt: 0, local: true }
}

function sanitizeCacheEntry(entry) {
  if (!entry || typeof entry !== 'object') return null
  if (typeof entry.fetchedAt !== 'number' || !Number.isFinite(entry.fetchedAt)) return null
  if (Date.now() - entry.fetchedAt > WORKSPACE_CACHE_MAX_AGE_MS) return null
  if (!Array.isArray(entry.workspaces)) return null
  return {
    fetchedAt: entry.fetchedAt,
    workspaces: entry.workspaces,
    sessions: Array.isArray(entry.sessions) ? entry.sessions : null,
  }
}

/** Last successful Companion snapshot per server, painted before any network. */
function getWorkspaceCache() {
  if (workspaceCache instanceof Map) return workspaceCache
  workspaceCache = new Map()
  try {
    const raw = JSON.parse(fs.readFileSync(WORKSPACE_CACHE_FILE(), 'utf8'))
    if (raw && typeof raw === 'object') {
      for (const [id, entry] of Object.entries(raw)) {
        const clean = sanitizeCacheEntry(entry)
        if (clean) workspaceCache.set(id, clean)
      }
    }
  } catch {
    // Missing or unreadable file simply means an empty dashboard on first paint.
  }
  return workspaceCache
}

function saveWorkspaceCache() {
  try {
    fs.mkdirSync(path.dirname(WORKSPACE_CACHE_FILE()), { recursive: true })
    fs.writeFileSync(WORKSPACE_CACHE_FILE(), JSON.stringify(Object.fromEntries(getWorkspaceCache())))
  } catch (error) {
    perfLog('workspace cache write failed: ' + error.message)
  }
}

const homeUrl = pathToFileURL(path.join(__dirname, 'renderer', 'index.html')).href
const trustedOrigins = new WeakMap()

let mainWindow = null;
let notificationFeed = null;
let localDshProcess = null;
let appIsQuitting = false;

/** Self-update service; broadcasts state snapshots to every home window. */
const updater = createUpdater({
  appVersion: app.getVersion(),
  hostArch: process.arch,
  resourcesPath: process.resourcesPath,
  platform: process.platform,
  isDevelopment: !app.isPackaged,
  isPackaged: app.isPackaged,
  runningAppImage: Boolean(process.env.APPIMAGE),
  runningPortable: Boolean(process.env.PORTABLE_EXECUTABLE_FILE),
  disabledByEnv: ['1', 'true', 'yes'].includes(String(process.env.DSH_NATIVE_DISABLE_AUTO_UPDATE ?? '').toLowerCase()),
  feedUrlOverride: process.env.DSH_NATIVE_UPDATE_FEED_URL || '',
  log: perfLog,
  broadcast: (snapshot) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send('updates:state', snapshot)
    }
  },
  readStoredChannel: getStoredUpdateChannel,
  writeStoredChannel: saveStoredUpdateChannel,
  onBeforeInstall: async () => {
    // Graceful shutdown of everything the app spawned before the installer
    // takes over; mirrors T3 Code stopping its backend pool pre-install.
    notificationFeed?.stop()
    stopLocalDsh(localDshProcess)
  },
  isQuitting: () => appIsQuitting,
})

const presentNotification = createNotificationPresenter({
  Notification,
  getWindow: () => mainWindow,
})

function requireHome(event) {
  assertHomeSender(event.senderFrame?.url, homeUrl)
}

function loadHome(win) {
  notificationFeed?.stop()
  trustedOrigins.delete(win)
  void win.loadFile(path.join(__dirname, 'renderer', 'index.html'))
}

function loadLocalHost(win) {
  trustedOrigins.set(win, new URL(LOCAL_DSH_URL).origin)
  // The notification feed intentionally remains HTTPS-only; local DSH Web can
  // still be used normally without enabling a privileged remote feed.
  void win.loadURL(LOCAL_DSH_URL)
}

/** Spawn dsh web if needed and wait for readiness; never navigates. */
function ensureLocalDshRunning(timeoutMs = LOCAL_CONNECT_TIMEOUT_MS) {
  if (localDshProcess && localDshProcess.exitCode === null) return Promise.resolve()
  let child
  child = startLocalDsh({
    onExit: (code, signal, output, error) => {
      if (localDshProcess === child) localDshProcess = null
      if (error) perfLog('dsh web failed to start: ' + error.message)
      else if (code !== 0) perfLog('dsh web exited (' + (code ?? signal) + '): ' + output.trim())
    },
  })
  localDshProcess = child
  return waitForDsh(LOCAL_DSH_URL, timeoutMs, child).catch(async (error) => {
    // A second `dsh web` cannot bind while an instance already serves 3080.
    // If something healthy answers anyway, use it instead of failing the card.
    try {
      if (await requestReady(LOCAL_DSH_URL)) {
        stopLocalDsh(child)
        if (localDshProcess === child) localDshProcess = null
        return
      }
    } catch {
      // fall through to the actionable error
    }
    stopLocalDsh(child)
    if (localDshProcess === child) localDshProcess = null
    throw new Error(error.message + ' Make sure the existing dsh command is installed and port 3080 is available.')
  })
}

async function startLocalDshWeb(win) {
  await ensureLocalDshRunning(LOCAL_CONNECT_TIMEOUT_MS)
  loadLocalHost(win)
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

  // Keep remote content on the selected server origin. Cross-origin destinations
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
    perfLog('first paint ready in ' + (performance.now() - bootStart).toFixed(0) + 'ms')
  })

  if (!targetUrl || !loadHost(win, targetUrl)) loadHome(win)

  win.webContents.once('did-finish-load', () => {
    perfLog('page loaded in ' + (performance.now() - bootStart).toFixed(0) + 'ms')
  })
  win.once('closed', () => {
    notificationFeed?.stop()
    if (mainWindow === win) mainWindow = null
  })
  return win
}

function showHome() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    loadHome(mainWindow)
  } else {
    mainWindow = createWindow(null)
  }
}

app.whenReady().then(() => {
  notificationFeed = new NotificationFeed({ onNotification: presentNotification })

  // Discovery starts on its own; failures never block app startup.
  updater.configure().catch((error) => perfLog('updater configure failed: ' + error.message))

  const mostRecent = getHosts()
    .slice()
    .sort((a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0))[0]

  mainWindow = createWindow(mostRecent ? mostRecent.url : null)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) showHome()
  })
  perfLog('gpu: ' + JSON.stringify(app.getGPUFeatureStatus()))
  // The feature status can be stale before the GPU process initializes.
  app.on('gpu-info-update', () => {
    perfLog('gpu update: ' + JSON.stringify(app.getGPUFeatureStatus()))
  })
  setTimeout(() => {
    perfLog('gpu settled: ' + JSON.stringify(app.getGPUFeatureStatus()))
  }, 5000)
})

app.on('before-quit', () => {
  appIsQuitting = true
  updater.dispose()
  notificationFeed?.stop()
  stopLocalDsh(localDshProcess)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// --- Companion aggregation ---------------------------------------------------

/** Memoized `tailscale status --json`; null means no usable local tailnet. */
async function getTailnetStatus() {
  if (tailnetMemo && Date.now() - tailnetMemo.at < TAILNET_MEMO_MS) return tailnetMemo.value
  const { status, diagnostic } = await readTailscaleStatus()
  if (!status) {
    if (diagnostic && diagnostic !== 'not-installed') perfLog('tailscale unavailable: ' + diagnostic)
    tailnetMemo = { at: Date.now(), value: null }
    return null
  }
  tailnetMemo = { at: Date.now(), value: status }
  return status
}

async function fetchLocalServerData(fetchImpl) {
  try {
    await ensureLocalDshRunning(LOCAL_REFRESH_START_TIMEOUT_MS)
  } catch (error) {
    return { ok: false, fetchedAt: Date.now(), failure: { reason: 'local-start', message: error.message } }
  }
  const result = await fetchCompanionServerData(LOCAL_DSH_URL, { fetchImpl, timeoutMs: REFRESH_TIMEOUT_MS })
  return { ...result, fetchedAt: Date.now() }
}

async function fetchRemoteServerData(host, fetchImpl, peers) {
  const result = await fetchCompanionServerData(host.url, { fetchImpl, timeoutMs: REFRESH_TIMEOUT_MS })
  if (!result.ok && isConnectivityFailure(result.failure)) {
    // A peer Tailscale itself reports offline gets a precise label instead of a generic timeout.
    const peer = findPeerForHost(peers, host.url)
    if (peer && !peer.online) {
      return { ok: false, fetchedAt: Date.now(), failure: { reason: 'offline-peer', message: 'This device is currently offline on your tailnet.' } }
    }
  }
  return { ...result, fetchedAt: Date.now() }
}

/** Probe responsive tailnet peers; only these become suggestions. */
async function refreshTailnetSuggestions(tailnetStatus, fetchImpl) {
  if (!tailnetStatus?.available) return { available: false, peers: [] }
  const savedHostnames = new Set(
    getHosts()
      .map((host) => {
        try { return new URL(host.url).hostname.toLowerCase() } catch { return '' }
      })
      .filter(Boolean),
  )
  const candidates = tailnetStatus.peers
    .filter((peer) => peer.dnsName && !savedHostnames.has(peer.dnsName.toLowerCase()))
    .slice(0, TAILNET_SUGGESTION_LIMIT)
  const probes = await probeCandidates(
    candidates.map((peer) => 'https://' + peer.dnsName.toLowerCase() + '/'),
    { fetchImpl, timeoutMs: 3500, concurrency: 4 },
  )
  const peers = candidates
    .map((peer, index) => ({
      dnsName: peer.dnsName,
      hostName: peer.hostName ?? peer.dnsName.split('.')[0],
      online: peer.online === true,
      probe: probes[index],
    }))
    .filter((peer) => peer.probe !== 'unreachable')
  return { available: true, peers }
}

function rememberServerResults(entries) {
  const cache = getWorkspaceCache()
  let changed = false
  for (const { host, result } of entries) {
    if (result.ok !== true) continue
    cache.set(host.id, {
      fetchedAt: result.fetchedAt,
      workspaces: result.workspaces ?? [],
      sessions: result.sessions,
    })
    changed = true
  }
  if (changed) saveWorkspaceCache()
}

/**
 * Assemble the renderer snapshot. Rows from servers whose live read failed are
 * still included from the last-good cache but flagged stale so the UI can dim
 * and age-label them; cached data never masquerades as current.
 */
function buildSnapshot(entries, tailnet, statusOverrides = {}) {
  const cache = getWorkspaceCache()
  const aggregationEntries = [];
  const servers = {};
  for (const { host, result } of entries) {
    const ok = result?.ok === true;
    const cached = ok ? null : sanitizeCacheEntry(cache.get(host.id));
    const rowsSource = ok
      ? { workspaces: result.workspaces ?? [], sessions: result.sessions ?? null }
      : cached;
    aggregationEntries.push({ host, result: { ok: true, workspaces: rowsSource?.workspaces ?? [], sessions: rowsSource?.sessions ?? null } });
    const failure = ok ? null : {
      reason: result.failure?.reason ?? 'network',
      message: typeof result.failure?.message === 'string' ? result.failure.message.slice(0, 300) : '',
      httpStatus: result.failure?.httpStatus ?? null,
    };
    servers[host.id] = {
      id: host.id,
      name: host.name,
      url: host.url,
      local: host.local === true,
      lastUsedAt: host.lastUsedAt ?? 0,
      status: statusOverrides[host.id] ?? (ok ? 'online' : 'unavailable'),
      fetchedAt: ok ? result.fetchedAt : (cached?.fetchedAt ?? null),
      failure,
      workspaceCount: rowsSource?.workspaces.length ?? 0,
    };
  }
  const aggregated = aggregateServers(aggregationEntries);
  const staleHostIds = new Set(Object.values(servers).filter((s) => s.status === 'unavailable').map((s) => s.id));
  const markStale = (row) => (staleHostIds.has(row.hostId) ? { ...row, stale: true } : row);
  return {
    generatedAt: Date.now(),
    servers,
    tailnet,
    rows: aggregated.workspaceRows.map(markStale),
    orphanSessions: aggregated.orphanSessions.map(markStale),
  };
}

function cacheEntryToResult(entry) {
  const clean = sanitizeCacheEntry(entry);
  if (!clean) return { ok: false, fetchedAt: Date.now(), failure: { reason: 'loading', message: '' } }
  return { ok: true, workspaces: clean.workspaces, sessions: clean.sessions, fetchedAt: clean.fetchedAt }
}

/** Instant pre-network snapshot from persisted caches; statuses stay honest. */
function buildCachedSnapshot() {
  const cache = getWorkspaceCache();
  const entries = [
    { host: localHostEntry(), result: cacheEntryToResult(cache.get(LOCAL_HOST_ID)) },
    ...getHosts().map((host) => ({ host, result: cacheEntryToResult(cache.get(host.id)) })),
  ];
  const overrides = {};
  for (const entry of entries) overrides[entry.host.id] = entry.result.ok ? 'cache' : 'loading';
  return buildSnapshot(entries, lastTailnetSuggestions, overrides);
}

async function performHomeRefresh(fetchImpl) {
  const hosts = getHosts();
  const tailnetStatus = await getTailnetStatus();
  const [localResult, remoteResults, tailnet] = await Promise.all([
    fetchLocalServerData(fetchImpl),
    Promise.all(hosts.map((host) => fetchRemoteServerData(host, fetchImpl, tailnetStatus?.peers ?? []))),
    refreshTailnetSuggestions(tailnetStatus, fetchImpl),
  ]);
  const entries = [
    { host: localHostEntry(), result: localResult },
    ...hosts.map((host, index) => ({ host, result: remoteResults[index] })),
  ];
  rememberServerResults(entries);
  lastTailnetSuggestions = tailnet;
  return buildSnapshot(entries, tailnet);
}

function queueRefresh(webContents) {
  if (refreshPromise) return refreshPromise;
  const session = webContents.session;
  refreshPromise = performHomeRefresh(session.fetch.bind(session))
    .finally(() => { refreshPromise = null; })
  return refreshPromise;
}

// --- IPC: Workspaces dashboard -----------------------------------------------

ipcMain.handle('home:snapshot', (event) => {
  requireHome(event)
  return buildCachedSnapshot();
});

ipcMain.handle('home:refresh', (event) => {
  requireHome(event);
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed()) throw new Error('The native window is unavailable.');
  return queueRefresh(win.webContents);
});

ipcMain.handle('home:connect', async (event, { hostId } = {}) => {
  requireHome(event);
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed()) throw new Error('The native window is unavailable.');
  if (hostId === LOCAL_HOST_ID) {
    await startLocalDshWeb(win);
    return;
  }
  const host = getHosts().find((h) => h.id === hostId);
  if (!host) throw new Error('Unknown server.');
  host.lastUsedAt = Date.now();
  saveHosts([host, ...getHosts().filter((h) => h.id !== host.id)]);
  if (!loadHost(win, host.url)) throw new Error('The saved server URL is invalid.');
});

// --- IPC: server management ----------------------------------------------------

function addHostCore(name, urlInput) {
  const normalized = normalizeUrl(urlInput);
  if (!normalized) throw new Error('Only valid https:// URLs are supported.');
  const hosts = getHosts();
  const existing = hosts.find((h) => h.url === normalized);
  if (existing) {
    existing.name = name || existing.name;
    saveHosts(hosts);
    return existing;
  }
  const host = {
    id: crypto.randomUUID(),
    name: name || new URL(normalized).host,
    url: normalized,
    lastUsedAt: 0,
  };
  hosts.push(host);
  saveHosts(hosts);
  return host;
}

ipcMain.handle('hosts:add', (event, { name, url } = {}) => {
  requireHome(event);
  return addHostCore(typeof name === 'string' ? name : '', url);
});

ipcMain.handle('hosts:remove', (event, id) => {
  requireHome(event);
  saveHosts(getHosts().filter((h) => h.id !== id));
  getWorkspaceCache().delete(String(id));
  saveWorkspaceCache();
});

ipcMain.handle('tailnet:add-server', (event, { dnsName, name } = {}) => {
  requireHome(event);
  const url = magicDnsHttpsUrl(dnsName);
  if (!url) throw new Error('That MagicDNS name is not valid.');
  return addHostCore(typeof name === 'string' ? name : '', url);
});

// --- IPC: self-updates --------------------------------------------------------

ipcMain.handle('updates:get-state', (event) => {
  requireHome(event)
  return updater.getState()
});

ipcMain.handle('updates:check', (event) => {
  requireHome(event)
  return updater.check('web-ui')
});

ipcMain.handle('updates:download', (event) => {
  requireHome(event)
  return updater.download()
});

ipcMain.handle('updates:install', (event) => {
  requireHome(event)
  return updater.install()
});

ipcMain.handle('updates:set-channel', (event, channel) => {
  requireHome(event)
  if (!isAllowedChannel(channel)) throw new Error('Unknown update channel.')
  return updater.setChannel(channel)
});

// Minimal menu so users can always get back to the aggregated dashboard.
Menu.setApplicationMenu(
  Menu.buildFromTemplate([
    {
      label: 'App',
      submenu: [
        { label: 'Workspaces…', accelerator: 'CmdOrCtrl+H', click: () => showHome() },
        { label: 'Check for Updates…', click: () => { void updater.check('menu').catch(() => {}) } },
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

