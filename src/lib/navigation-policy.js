'use strict'

const { normalizeUrl } = require('./normalize-url')

/**
 * Classify a renderer navigation against the selected server origin.
 *
 * @param {string | undefined} trustedOrigin
 * @param {string} targetUrl
 * @returns {{ action: 'allow' | 'deny' | 'external', url: string | null }}
 */
function classifyNavigation(trustedOrigin, targetUrl) {
  const normalized = normalizeUrl(targetUrl)
  if (!normalized) return { action: 'deny', url: null }

  if (trustedOrigin && new URL(normalized).origin === trustedOrigin) {
    return { action: 'allow', url: normalized }
  }

  return { action: 'external', url: normalized }
}

module.exports = { classifyNavigation }
