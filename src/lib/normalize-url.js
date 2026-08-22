'use strict'

/**
 * Normalize an HTTPS URL for storage.
 *
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

module.exports = { normalizeUrl }
