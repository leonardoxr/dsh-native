'use strict'

// Update channels, ported from T3 Code's updateChannels.ts.
//
// DSH Native publishes prereleases whenever a tag carries a semver prerelease
// segment (the release workflow marks those GitHub releases "pre-release"),
// so the two channels map directly onto electron-updater's allowPrerelease.

const CHANNELS = /** @type {const} */ (['stable', 'prerelease'])

const PRERELEASE_PATTERN = /^[0-9A-Za-z.+-]+?-[0-9A-Za-z.-]+(?:\+[0-9A-Za-z.-]+)?$/

/** True when the version string carries a prerelease segment (e.g. 1.2.0-beta.3). */
function isPrereleaseVersion(version) {
  if (typeof version !== 'string') return false
  const bare = version.startsWith('v') ? version.slice(1) : version
  if (!PRERELEASE_PATTERN.test(bare)) return false
  // A lone hyphen in something like a date (2024.01-02) is not a semver
  // prerelease; require the segment after the hyphen to look like one.
  const pre = bare.split('+')[0].split('-').slice(1)
  return pre.length > 0 && pre.every((part) => /^[0-9A-Za-z-]+$/.test(part))
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
