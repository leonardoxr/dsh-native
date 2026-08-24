'use strict'

// Update channels, ported from T3 Code's updateChannels.ts.
//
// DSH Native publishes prereleases whenever a tag carries a semver prerelease
// segment (the release workflow marks those GitHub releases "pre-release"),
// so the two channels map directly onto electron-updater's allowPrerelease.

const CHANNELS = ['stable', 'prerelease']

/**
 * True when the version string carries a semver prerelease segment
 * (e.g. 1.2.0-beta.3). The core must be numeric and every dot-separated
 * prerelease identifier must be alphanumeric, so date-like strings such as
 * 2024.01 do not slip through.
 */
function isPrereleaseVersion(version) {
  if (typeof version !== 'string') return false
  const bare = version.startsWith('v') ? version.slice(1) : version
  const plusIndex = bare.indexOf('+')
  const core = plusIndex === -1 ? bare : bare.slice(0, plusIndex)
  const dashIndex = core.indexOf('-')
  if (dashIndex <= 0 || dashIndex === core.length - 1) return false
  if (!/^\d+(?:\.\d+){0,2}$/.test(core.slice(0, dashIndex))) return false
  return core
    .slice(dashIndex + 1)
    .split('.')
    .every((part) => /^[0-9A-Za-z-]+$/.test(part))
}

function isAllowedChannel(channel) {
  return CHANNELS.includes(channel)
}

/**
 * The channel a given version was published on. Used both to pick the default
 * channel for the running build and to ignore feed entries that do not match
 * the user-selected channel.
 */
function resolveDefaultUpdateChannel(appVersion) {
  return isPrereleaseVersion(appVersion) ? 'prerelease' : 'stable'
}

module.exports = { CHANNELS, isAllowedChannel, isPrereleaseVersion, resolveDefaultUpdateChannel }
