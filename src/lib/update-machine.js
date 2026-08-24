'use strict'

// Pure state machine for DSH Native self-updates.
//
// Ported from T3 Code's desktop update reducer
// (github.com/pingdotgg/t3code, apps/desktop/src/updates/updateMachine.ts):
// every transition is a pure (state, event) -> next state function so the
// whole update lifecycle can be exercised with plain node --test suites.
// The updater service in updater.js owns the single live state object,
// applies these reducers, and broadcasts snapshots to the renderer.

/**
 * @param {string} currentVersion
 * @param {'stable'|'prerelease'} channel
 * @param {{ hostArch?: string|null, appArch?: string|null }} [runtimeInfo]
 */
function createInitialUpdateState(currentVersion, channel, runtimeInfo = {}) {
  return {
    enabled: false,
    status: 'disabled',
    channel,
    currentVersion,
    hostArch: runtimeInfo.hostArch ?? null,
    appArch: runtimeInfo.appArch ?? null,
    availableVersion: null,
    downloadedVersion: null,
    releaseNotes: [],
    downloadPercent: null,
    checkedAt: null,
    message: null,
    errorContext: null,
    canRetry: false,
  }
}

/**
 * Enabled base state; resets all update progress when toggles or channels
 * change. Pass channelOverride when switching channels so progress from the
 * previous feed never leaks into the new one.
 */
function createBaseUpdateState(previous, enabled, channelOverride) {
  return {
    ...createInitialUpdateState(previous.currentVersion, channelOverride ?? previous.channel, {
      hostArch: previous.hostArch,
      appArch: previous.appArch,
    }),
    enabled,
    status: enabled ? 'idle' : 'disabled',
  }
}

function nextStatusAfterDownloadFailure(state) {
  return state.availableVersion ? 'available' : 'error'
}

function canRetryAfterDownloadFailure(state) {
  return state.availableVersion !== null
}

function canRetryFromState(state) {
  return state.availableVersion !== null || state.downloadedVersion !== null
}

function onCheckStart(state, checkedAt) {
  const hasDownloadedUpdate = state.downloadedVersion !== null
  return {
    ...state,
    status: 'checking',
    checkedAt,
    releaseNotes: hasDownloadedUpdate ? state.releaseNotes : [],
    message: null,
    downloadPercent: hasDownloadedUpdate ? 100 : null,
    errorContext: null,
    canRetry: false,
  }
}

function onCheckFailure(state, message, checkedAt) {
  if (state.downloadedVersion !== null) {
    // A downloaded update stays installable even when a later check fails.
    return {
      ...state,
      status: 'downloaded',
      message: null,
      checkedAt,
      downloadPercent: 100,
      errorContext: null,
      canRetry: true,
    }
  }
  return {
    ...state,
    status: 'error',
    message,
    checkedAt,
    downloadPercent: null,
    errorContext: 'check',
    canRetry: true,
  }
}

function onUpdateAvailable(state, version, checkedAt, releaseNotes = []) {
  const isDownloadedVersion = state.downloadedVersion === version
  const nextReleaseNotes =
    isDownloadedVersion && releaseNotes.length === 0 ? state.releaseNotes : releaseNotes
  return {
    ...state,
    status: isDownloadedVersion ? 'downloaded' : 'available',
    availableVersion: version,
    downloadedVersion: isDownloadedVersion ? version : null,
    releaseNotes: nextReleaseNotes,
    downloadPercent: isDownloadedVersion ? 100 : null,
    checkedAt,
    message: null,
    errorContext: null,
    canRetry: isDownloadedVersion,
  }
}

function onNoUpdate(state, checkedAt) {
  if (state.downloadedVersion !== null) {
    // The feed is behind what we already hold locally: keep it installable.
    return {
      ...state,
      status: 'downloaded',
      availableVersion: state.downloadedVersion,
      downloadPercent: 100,
      checkedAt,
      message: null,
      errorContext: null,
      canRetry: true,
    }
  }
  return {
    ...state,
    status: 'up-to-date',
    availableVersion: null,
    downloadedVersion: null,
    releaseNotes: [],
    downloadPercent: null,
    checkedAt,
    message: null,
    errorContext: null,
    canRetry: false,
  }
}

function onDownloadStart(state) {
  return {
    ...state,
    status: 'downloading',
    downloadPercent: 0,
    message: null,
    errorContext: null,
    canRetry: false,
  }
}

function onDownloadFailure(state, message) {
  return {
    ...state,
    status: nextStatusAfterDownloadFailure(state),
    message,
    downloadPercent: null,
    errorContext: 'download',
    canRetry: canRetryAfterDownloadFailure(state),
  }
}

function onDownloadProgress(state, percent) {
  return {
    ...state,
    status: 'downloading',
    downloadPercent: percent,
    message: null,
    errorContext: null,
    canRetry: false,
  }
}

function onDownloadComplete(state, version) {
  return {
    ...state,
    status: 'downloaded',
    availableVersion: version,
    downloadedVersion: version,
    downloadPercent: 100,
    message: null,
    errorContext: null,
    canRetry: true,
  }
}

function onInstallFailure(state, message) {
  return {
    ...state,
    status: 'downloaded',
    message,
    errorContext: 'install',
    canRetry: true,
  }
}

/**
 * Download progress arrives many times per second; only repaint the UI at
 * coarse steps so IPC traffic stays flat during large downloads.
 */
function shouldBroadcastDownloadProgress(currentState, nextPercent) {
  if (currentState.status !== 'downloading') return true
  const currentPercent = currentState.downloadPercent
  if (currentPercent === null) return true
  const previousStep = Math.floor(currentPercent / 10)
  const nextStep = Math.floor(nextPercent / 10)
  return nextStep !== previousStep || nextPercent === 100
}

module.exports = {
  canRetryFromState,
  createBaseUpdateState,
  createInitialUpdateState,
  nextStatusAfterDownloadFailure,
  onCheckFailure,
  onCheckStart,
  onDownloadComplete,
  onDownloadFailure,
  onDownloadProgress,
  onDownloadStart,
  onInstallFailure,
  onNoUpdate,
  onUpdateAvailable,
  shouldBroadcastDownloadProgress,
}
