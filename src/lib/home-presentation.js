'use strict'

// Pure presentation mapping for the Workspaces dashboard, shared by the
// main process (banner synthesis) and the bundled renderer (labels, ages).
// Dual-mode: CommonJS for tests/main, window.DshHomePresentation in renderer.
;(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory()
  else root.DshHomePresentation = factory()
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function cmp(a, b) {
    if (a < b) return -1
    if (a > b) return 1
    return 0
  }

  /** Relative age label; deliberately coarse, refreshed by a render tick. */
  function formatAge(fetchedAt, nowMs) {
    const now = typeof nowMs === 'number' ? nowMs : Date.now()
    if (typeof fetchedAt !== 'number' || !Number.isFinite(fetchedAt)) return ''
    const seconds = Math.max(0, Math.floor((now - fetchedAt) / 1000))
    if (seconds < 5) return 'just now'
    if (seconds < 60) return seconds + 's ago'
    if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago'
    if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago'
    return Math.floor(seconds / 86400) + 'd ago'
  }

  function hostLabelForHint(hostUrl) {
    try {
      return new URL(hostUrl).hostname
    } catch {
      return '<server-host>'
    }
  }

  /** Map one server failure to user-facing wording. Never raw error text. */
  function presentFailure(failure, hostUrl) {
    const reason = failure?.reason ?? 'network'
    switch (reason) {
      case 'unauthorized':
        return {
          tone: 'bad',
          label: 'Not authorized',
          hint: 'On the server run: dsh web --trusted-host ' + hostLabelForHint(hostUrl),
          showsProgress: false,
        };
      case 'not-found':
        return { tone: 'bad', label: 'No Companion', hint: 'Install dsh-companion on this server to list its workspaces.', showsProgress: false };
      case 'offline-peer':
        return { tone: 'bad', label: 'Offline (tailnet)', hint: 'This device is currently offline on your Tailscale network.', showsProgress: false };
      case 'timeout':
        return { tone: 'bad', label: 'Unreachable', hint: 'The server did not respond in time.', showsProgress: false };
      case 'dns':
        return { tone: 'bad', label: 'Unreachable', hint: 'The server host could not be resolved.', showsProgress: false };
      case 'refused':
        return { tone: 'bad', label: 'Unreachable', hint: 'The connection was refused.', showsProgress: false };
      case 'tls':
        return { tone: 'bad', label: 'Unreachable', hint: 'TLS certificate validation failed.', showsProgress: false };
      case 'local-start':
        return { tone: 'bad', label: 'Cannot start local DSH Web', hint: failure?.message ?? '', showsProgress: false };
      default:
        return { tone: 'bad', label: 'Unavailable', hint: failure?.message ?? '', showsProgress: false }
    }
  }

  /**
   * One dashboard entry per server.
   * status: online | unavailable | cache | starting | loading
   */
  function presentServer(server, nowMs) {
    switch (server?.status) {
      case 'online':
        return { tone: 'ok', label: '', hint: '', showsProgress: false };
      case 'starting':
        return { tone: 'busy', label: 'Starting local DSH Web…', hint: '', showsProgress: true };
      case 'loading':
        return { tone: 'busy', label: 'Checking…', hint: '', showsProgress: true };
      case 'cache':
        return { tone: 'idle', label: 'Last seen ' + formatAge(server.fetchedAt, nowMs), hint: '', showsProgress: false };
      case 'unavailable':
        return presentFailure(server.failure, server.url)
      default:
        return { tone: 'idle', label: '', hint: '', showsProgress: false }
    }
  }

  /**
   * t3code-style banner: silence when healthy, progress while checking,
   * a compact summary only when something is degraded.
   */
  function presentBanner(servers) {
    const list = Array.isArray(servers) ? servers : [];
    if (list.length === 0) return null
    const checking = list.filter((server) => server.status === 'loading' || server.status === 'starting').length;
    const degraded = list.filter((server) => server.status === 'unavailable').length;
    if (checking > 0) {
      return {
        tone: 'busy',
        label: checking === list.length ? 'Checking servers…' : 'Refreshing ' + checking + (checking === 1 ? ' server…' : ' servers…'),
        showsProgress: true,
      }
    }
    if (degraded > 0) {
      return { tone: 'warn', label: degraded + ' of ' + list.length + ' servers unavailable', showsProgress: false }
    }
    return null
  }

  function sortRecency(a, b) {
    return cmp(b.updatedAt, a.updatedAt)
      || cmp(String(a.title), String(b.title))
      || cmp(String(a.path ?? ''), String(b.path ?? ''))
      || cmp(a.hostName, b.hostName)
      || cmp(String(a.id), String(b.id))
  }

  return { formatAge, presentBanner, presentFailure, presentServer, sortRecency }
})