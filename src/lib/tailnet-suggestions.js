'use strict'

const DEFAULT_SUGGESTION_LIMIT = 24
const DEFAULT_TTL_MS = 5 * 60 * 1000
const MAX_CACHED_PEERS = 256

/**
 * Cache Companion readiness probes per tailnet peer so dashboard refreshes
 * do not re-probe healthy peers every cycle. New peers and expired entries
 * are the only URLs sent to Companion; online flags are merged from fresh
 * tailscale status without invalidating readiness labels.
 */
function createTailnetSuggestionTracker({
  suggestionLimit = DEFAULT_SUGGESTION_LIMIT,
  ttlMs = DEFAULT_TTL_MS,
  now = Date.now,
} = {}) {
  /** @type {Map<string, { at: number, label: string }>} */
  const probeCache = new Map()

  function buildCandidates(peers, savedHostnames) {
    const saved = new Set(
      (Array.isArray(savedHostnames) ? savedHostnames : [...(savedHostnames ?? [])])
        .filter((name) => typeof name === 'string' && name !== '')
        .map((name) => name.toLowerCase()),
    )
    return (Array.isArray(peers) ? peers : [])
      .filter((peer) => {
        if (!peer || typeof peer.dnsName !== 'string' || peer.dnsName === '') return false
        return !saved.has(peer.dnsName.toLowerCase())
      })
      .slice(0, Math.max(0, suggestionLimit))
  }

  /**
   * Produce the suggestion list for one refresh cycle.
   * `peers` is the parsed tailscale status projection, `savedHostnames` the
   * lower-case hostnames already saved as servers, and `probe(urls)` resolves
   * one readiness label per URL ('ready' | 'unauthorized' | 'unreachable').
   */
  async function refresh({ peers, savedHostnames, probe }) {
    if (typeof probe !== 'function') throw new TypeError('probe must be a function')
    const candidates = buildCandidates(peers, savedHostnames)
    const timestamp = now()
    const pending = candidates.filter((peer) => {
      const cached = probeCache.get(peer.dnsName.toLowerCase())
      return !cached || timestamp - cached.at >= ttlMs
    })
    if (pending.length > 0) {
      const labels = await probe(
        pending.map((peer) => 'https://' + peer.dnsName.toLowerCase() + '/'),
      )
      const storedAt = now()
      for (const [index, peer] of pending.entries()) {
        probeCache.set(peer.dnsName.toLowerCase(), {
          at: storedAt,
          label: labels[index] ?? 'unreachable',
        })
      }
      while (probeCache.size > MAX_CACHED_PEERS) {
        probeCache.delete(probeCache.keys().next().value)
      }
    }

    return {
      available: true,
      peers: candidates
        .map((peer) => {
          const cached = probeCache.get(peer.dnsName.toLowerCase())
          return {
            dnsName: peer.dnsName,
            hostName: typeof peer.hostName === 'string' && peer.hostName !== ''
              ? peer.hostName
              : peer.dnsName.split('.')[0],
            online: peer.online === true,
            probe: cached?.label ?? 'unreachable',
          }
        })
        .filter((peer) => peer.probe !== 'unreachable'),
    }
  }

  return { refresh }
}

module.exports = { createTailnetSuggestionTracker, DEFAULT_SUGGESTION_LIMIT, DEFAULT_TTL_MS }
