'use strict'

// Self-update service for DSH Native.
//
// Ported from T3 Code's desktop updater (github.com/pingdotgg/t3code,
// apps/desktop/src/updates/DesktopUpdates.ts) and reshaped for plain
// CommonJS on top of electron-updater. The inherited design:
//
// - updates are discovered automatically but never downloaded or installed
//   without an explicit user action;
// - the whole lifecycle runs through the pure state machine in
//   update-machine.js; every transition broadcasts a snapshot to the renderer;
// - only one update action (check / download / install / channel switch) may
//   run at a time;
// - unsupported environments surface a precise disabled reason instead of
//   failing later at check time.
//
// This module deliberately never imports electron: everything environment-
// specific arrives through options so the service can run against a fake
// electron-updater in tests.

const fs = require('node:fs')
const path = require('node:path')
const { autoUpdater } = require('electron-updater')

const machine = require('./update-machine')
const { normalizeReleaseNotes } = require('./release-notes')
const { isAllowedChannel, resolveDefaultUpdateChannel } = require('./update-channels')

/** First automatic check lands shortly after launch, like T3 Code. */
const STARTUP_CHECK_DELAY_MS = 15000

/**
 * Steady-state re-check cadence. T3 Code polls every 4 minutes against its own
 * feed; we poll a public GitHub feed, where unauthenticated API requests are
 * rate-limited per IP, so the interval stays conservative.
 */
const POLL_INTERVAL_MS = 30 * 60 * 1000

const UPDATE_ACTIONS = ['check', 'download', 'install', 'channel']

function noop() {}

function errorMessage(error) {
  if (error && typeof error.message === 'string' && error.message.length > 0) return error.message
  return String(error)
}

/** Minimal key/value reader for electron-builder's app-update.yml. */
function parseAppUpdateYml(raw) {
  const entries = {}
  for (const line of String(raw).split('\n')) {
    const match = line.match(/^(\w+):\s*(.+)$/)
    if (match && match[2]) entries[match[1]] = match[2].trim()
  }
  return typeof entries.provider === 'string' && entries.provider.length > 0 ? entries : null
}

function readFeedConfig(resourcesPath) {
  if (!resourcesPath) return null
  try {
    return parseAppUpdateYml(fs.readFileSync(path.join(resourcesPath, 'app-update.yml'), 'utf8'))
  } catch {
    // Missing app-update.yml simply means no packaged feed was baked in.
    return null
  }
}

/**
 * Decide why auto-updates are unavailable, or return null when they may run.
 * Pure so the full decision table is testable without electron.
 */
function getAutoUpdateDisabledReason(args) {
  if (!args.hasFeedConfig) {
    return 'Automatic updates are not available because no update feed is configured.'
  }
  if (args.isDevelopment || !args.isPackaged) {
    return 'Automatic updates are only available in packaged production builds.'
  }
  if (args.disabledByEnv) {
    return 'Automatic updates are disabled by the DSH_NATIVE_DISABLE_AUTO_UPDATE setting.'
  }
  // Ad-hoc signed macOS bundles cannot pass electron-updater's signature
  // verification; self-update ships once Developer ID signing does.
  if (args.platform === 'darwin') {
    return 'Automatic updates on macOS need Developer ID signing and will arrive in a future release.'
  }
  if (args.platform === 'linux' && !args.runningAppImage) {
    return 'Automatic updates on Linux require the AppImage build; the .deb package updates through your package manager.'
  }
  if (args.platform === 'win32' && args.runningPortable) {
    return 'The portable Windows build cannot update itself; install the NSIS setup to get automatic updates.'
  }
  return null
}

/**
 * @param {object} options
 * @param {string} options.appVersion            Running version (app.getVersion()).
 * @param {string} [options.hostArch]            process.arch, surfaced in snapshots.
 * @param {string} [options.resourcesPath]       process.resourcesPath for app-update.yml.
 * @param {string} [options.platform]            process.platform.
 * @param {boolean} [options.isDevelopment]      !app.isPackaged.
 * @param {boolean} [options.isPackaged]         app.isPackaged.
 * @param {boolean} [options.runningAppImage]    truthy APPIMAGE env presence.
 * @param {boolean} [options.runningPortable]    truthy PORTABLE_EXECUTABLE_FILE env presence.
 * @param {boolean} [options.disabledByEnv]      DSH_NATIVE_DISABLE_AUTO_UPDATE kill switch.
 * @param {string} [options.feedUrlOverride]     Force a generic feed (local testing).
 * @param {(message: string) => void} [options.log]
 * @param {(state: object) => void} [options.broadcast] Push state snapshots to the renderer.
 * @param {() => string|null} [options.readStoredChannel]
 * @param {(channel: string) => void} [options.writeStoredChannel]
 * @param {() => Promise<void>} [options.onBeforeInstall] Graceful child shutdown hook.
 * @param {() => boolean} [options.isQuitting]   True once app quit has started.
 * @param {object} [options.updaterImpl]         electron-updater instance (injectable).
 */
function createUpdater(options = {}) {
  if (typeof options.appVersion !== 'string' || options.appVersion.length === 0) {
    throw new Error('createUpdater requires the running appVersion.')
  }

  const log = options.log || noop
  const broadcast = options.broadcast || noop
  const readStoredChannel = options.readStoredChannel || (() => null)
  const writeStoredChannel = options.writeStoredChannel || noop
  const onBeforeInstall = options.onBeforeInstall || (() => Promise.resolve())
  const isQuitting = options.isQuitting || (() => false)
  const updaterImpl = options.updaterImpl || autoUpdater

  const runtimeInfo = { hostArch: options.hostArch ?? null, appArch: options.hostArch ?? null }

  const storedChannel = readStoredChannel()
  const initialChannel = isAllowedChannel(storedChannel)
    ? storedChannel
    : resolveDefaultUpdateChannel(options.appVersion)

  let state = machine.createInitialUpdateState(options.appVersion, initialChannel, runtimeInfo)
  let configured = false
  let enabled = false
  let disabledReasonValue = null
  let activeAction = null
  let installArmed = false
  let lastLoggedDownloadMilestone = -1
  let startupTimer = null
  let pollTimer = null
  /** @type {Array<[string, Function]>} */
  const attachedListeners = []

  function getState() {
    return state
  }

  function setState(next) {
    state = next
    broadcast(state)
    return state
  }

  function applyTransition(reducer, ...args) {
    return setState(reducer(state, ...args))
  }

  function currentIsoTimestamp() {
    return new Date().toISOString()
  }

  function resetProgressLog() {
    lastLoggedDownloadMilestone = -1
  }

  function tryStartAction(action) {
    if (activeAction !== null) return false
    activeAction = action
    return true
  }

  function finishAction(action) {
    if (activeAction === action) activeAction = null
  }

  function applyAutoUpdaterChannel(channel) {
    const allowsPrerelease = channel === 'prerelease'
    try {
      updaterImpl.allowPrerelease = allowsPrerelease
      updaterImpl.allowDowngrade = allowsPrerelease
    } catch (error) {
      log('updater channel configuration failed: ' + errorMessage(error))
    }
    log(
      'update channel ' + channel +
        ' (allowPrerelease=' + allowsPrerelease + ', allowDowngrade=' + allowsPrerelease + ')',
    )
  }

  function safeHandle(event, handle) {
    try {
      handle()
    } catch (error) {
      log('failed to handle update ' + event + ' event: ' + errorMessage(error))
    }
  }

  function onUpdateAvailableRaw(raw) {
    safeHandle('available', () => {
      const info = raw || {}
      const version = typeof info.version === 'string' ? info.version : null
      if (!version) throw new Error('event carried no version')

      // A feed entry from another channel (e.g. a prerelease landing before
      // the channel switch completes) must not flip visible state.
      if (resolveDefaultUpdateChannel(version) !== state.channel) {
        log('ignoring update outside selected channel: ' + version + ' (on ' + state.channel + ')')
        applyTransition(machine.onNoUpdate, currentIsoTimestamp())
        resetProgressLog()
        return
      }
      const releaseNotes = normalizeReleaseNotes(info.releaseNotes, version)
      applyTransition(machine.onUpdateAvailable, version, currentIsoTimestamp(), releaseNotes)
      resetProgressLog()
      log('update available: ' + version)
    })
  }

  function onDownloadProgressRaw(raw) {
    safeHandle('progress', () => {
      const percent = Number(raw && raw.percent)
      if (!Number.isFinite(percent)) return
      const clamped = Math.min(100, Math.max(0, percent))
      if (machine.shouldBroadcastDownloadProgress(state, clamped) || state.message !== null) {
        applyTransition(machine.onDownloadProgress, Math.floor(clamped))
      }
      const milestone = Math.floor(clamped / 10) * 10
      if (milestone > lastLoggedDownloadMilestone) {
        lastLoggedDownloadMilestone = milestone
        log('download progress: ' + Math.floor(clamped) + '%')
      }
    })
  }

  function onUpdaterErrorRaw(raw) {
    safeHandle('error', () => {
      const message = errorMessage(raw)
      if (activeAction === 'install' || installArmed) {
        installArmed = false
        finishAction('install')
        applyTransition(machine.onInstallFailure, message)
        log('install reported an error: ' + message)
        return
      }
      if (activeAction === null) {
        setState({
          ...state,
          status: 'error',
          message,
          checkedAt: currentIsoTimestamp(),
          downloadPercent: null,
          errorContext: state.errorContext,
          canRetry: machine.canRetryFromState(state),
        })
      }
      log('updater reported an error: ' + message)
    })
  }

  /**
   * Shared check pipeline. reservation 'held' means the caller already owns
   * the single-flight slot (channel switches reuse it).
   */
  async function runCheck(reason, reservation = 'acquire') {
    if (isQuitting() || installArmed || !configured) return false
    if (state.status === 'downloading') {
      log('skipping update check while a download runs (' + reason + ')')
      return false
    }
    if (reservation === 'acquire' && !tryStartAction('check')) return false
    try {
      applyTransition(machine.onCheckStart, currentIsoTimestamp())
      log('checking for updates (' + reason + ')')
      await updaterImpl.checkForUpdates()
      return true
    } catch (error) {
      applyTransition(machine.onCheckFailure, errorMessage(error), currentIsoTimestamp())
      log('update check failed: ' + errorMessage(error))
      return true
    } finally {
      if (reservation === 'acquire') finishAction('check')
    }
  }

  function attachListener(event, handler) {
    try {
      updaterImpl.on(event, handler)
      attachedListeners.push([event, handler])
    } catch (error) {
      log('could not subscribe to updater ' + event + ': ' + errorMessage(error))
    }
  }

  function schedulePollers() {
    startupTimer = setTimeout(() => {
      void runCheck('startup')
    }, STARTUP_CHECK_DELAY_MS)
    pollTimer = setInterval(() => {
      void runCheck('poll')
    }, POLL_INTERVAL_MS)
    // Never hold the process open just for an update timer.
    if (typeof startupTimer.unref === 'function') startupTimer.unref()
    if (typeof pollTimer.unref === 'function') pollTimer.unref()
  }

  return {
    getState,
    get disabledReason() {
      return disabledReasonValue
    },

    async configure() {
      const feedConfig =
        readFeedConfig(options.resourcesPath)

      disabledReasonValue = getAutoUpdateDisabledReason({
        hasFeedConfig: feedConfig !== null || Boolean(options.feedUrlOverride),
        isDevelopment: Boolean(options.isDevelopment),
        isPackaged: Boolean(options.isPackaged),
        platform: options.platform || 'unknown',
        runningAppImage: Boolean(options.runningAppImage),
        runningPortable: Boolean(options.runningPortable),
        disabledByEnv: Boolean(options.disabledByEnv),
      })
      enabled = disabledReasonValue === null
      setState(machine.createBaseUpdateState(state, enabled))

      if (options.feedUrlOverride) {
        try {
          updaterImpl.setFeedURL({ provider: 'generic', url: options.feedUrlOverride })
        } catch (error) {
          log('custom update feed rejected: ' + errorMessage(error))
        }
      }

      if (!enabled) {
        log('auto-update disabled: ' + disabledReasonValue)
        return
      }

      configured = true
      try {
        // Discovery is automatic; bytes only move when the user asks.
        updaterImpl.autoDownload = false
        updaterImpl.autoInstallOnAppQuit = false
      } catch (error) {
        log('updater pre-configuration failed: ' + errorMessage(error))
      }

      applyAutoUpdaterChannel(state.channel)

      attachListener('checking-for-update', () => {
        log('looking for updates')
      })
      attachListener('update-available', onUpdateAvailableRaw)
      attachListener('update-not-available', () => {
        safeHandle('not-available', () => {
          applyTransition(machine.onNoUpdate, currentIsoTimestamp())
          resetProgressLog()
          log('no updates available')
        })
      })
      attachListener('download-progress', onDownloadProgressRaw)
      attachListener('update-downloaded', (raw) => {
        safeHandle('downloaded', () => {
          const info = raw || {}
          const version =
            typeof info.version === 'string' && info.version.length > 0 ? info.version : state.availableVersion
          applyTransition(machine.onDownloadComplete, version)
          log('update downloaded: ' + version)
        })
      })
      attachListener('error', onUpdaterErrorRaw)

      schedulePollers()
      log('auto-update enabled on channel ' + state.channel)
    },

    async check(reason) {
      if (!configured) return { checked: false, state: getState() }
      const checked = await runCheck(reason || 'manual')
      return { checked, state: getState() }
    },

    async download() {
      const rejected = { accepted: false, completed: false, state: getState() }
      if (!configured || installArmed || state.status !== 'available') return rejected
      if (!tryStartAction('download')) return rejected
      try {
        applyTransition(machine.onDownloadStart)
        log('downloading update ' + state.availableVersion)
        await updaterImpl.downloadUpdate()
        return { accepted: true, completed: true, state: getState() }
      } catch (error) {
        applyTransition(machine.onDownloadFailure, errorMessage(error))
        log('download failed: ' + errorMessage(error))
        return { accepted: true, completed: false, state: getState() }
      } finally {
        finishAction('download')
      }
    },

    async install() {
      const rejected = { accepted: false, completed: false, state: getState() }
      if (!configured || isQuitting() || installArmed) return rejected
      const installable =
        state.downloadedVersion !== null &&
        (state.status === 'downloaded' ||
          (state.status === 'error' && (state.errorContext === null || state.errorContext === 'install')))
      if (!installable) return rejected
      if (!tryStartAction('install')) return rejected
      installArmed = true
      try {
        // Give spawned children (local DSH Web, notification feed) a graceful
        // stop before the installer tears the process down, mirroring how T3
        // Code stops its backend pool ahead of quitAndInstall.
        await onBeforeInstall()
        log('installing update ' + state.downloadedVersion + '; the app restarts afterwards')
        // Silent NSIS install, force relaunch after completion.
        updaterImpl.quitAndInstall(true, true)
        return { accepted: true, completed: false, state: getState() }
      } catch (error) {
        installArmed = false
        applyTransition(machine.onInstallFailure, errorMessage(error))
        log('install failed: ' + errorMessage(error))
        return { accepted: true, completed: false, state: getState() }
      } finally {
        finishAction('install')
      }
    },

    async setChannel(channel) {
      if (!isAllowedChannel(channel)) throw new Error('Unknown update channel: ' + channel)
      if (activeAction !== null) {
        throw new Error(
          'Cannot change the update channel while an update action (' + activeAction + ') is running.',
        )
      }
      activeAction = 'channel'
      try {
        if (channel === state.channel) return getState()

        writeStoredChannel(channel)
        setState(machine.createBaseUpdateState(state, enabled, channel))

        if (!enabled || !configured) return getState()

        applyAutoUpdaterChannel(channel)
        const previousAllowDowngrade = updaterImpl.allowDowngrade
        updaterImpl.allowDowngrade = true
        try {
          // allowDowngrade during the first post-switch check lets a stable
          // user land back on an older stable after leaving prereleases.
          await runCheck('channel-change', 'held')
        } finally {
          try {
            updaterImpl.allowDowngrade = Boolean(previousAllowDowngrade)
          } catch {
            // Restoring the previous flag is best-effort.
          }
        }
        return getState()
      } finally {
        finishAction('channel')
      }
    },

    dispose() {
      if (startupTimer !== null) clearTimeout(startupTimer)
      if (pollTimer !== null) clearInterval(pollTimer)
      startupTimer = null
      pollTimer = null
      for (const [event, handler] of attachedListeners) {
        try {
          updaterImpl.removeListener(event, handler)
        } catch {
          // Detaching must never break shutdown.
        }
      }
      attachedListeners.length = 0
      configured = false
    },
  }
}

module.exports = {
  POLL_INTERVAL_MS,
  STARTUP_CHECK_DELAY_MS,
  UPDATE_ACTIONS,
  createUpdater,
  getAutoUpdateDisabledReason,
  parseAppUpdateYml,
}
