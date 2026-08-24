'use strict'

const { spawn } = require('node:child_process')

const DEFAULT_TIMEOUT_MS = 2500

function tailscaleCommand(platform = process.platform) {
  return platform === 'win32' ? 'tailscale.exe' : 'tailscale'
}

/** Whether one address is an IPv4 literal inside the Tailscale CGNAT range. */
function isTailscaleIpv4(address) {
  if (typeof address !== 'string') return false
  const parts = address.split('.')
  if (parts.length !== 4) return false
  const numbers = parts.map((part) => (/^\d{1,3}$/.test(part) ? Number(part) : Number.NaN))
  if (numbers.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false
  return numbers[0] === 100 && numbers[1] >= 64 && numbers[1] <= 127
}

function normalizeMagicDnsName(value) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().replace(/\.$/, '')
  return trimmed.length > 0 ? trimmed : null
}

// Matched against CLI stderr, most specific first. Diagnostics are labels
// only: raw tailscale stderr can contain auth keys and must never be logged.
const STDERR_DIAGNOSTICS = [
  [/handler does not exist/i, 'no-existing-handler'],
  [/not logged in|logged out|needs? login/i, 'not-logged-in'],
  [/permission denied|access denied|must be root|operation not permitted/i, 'permission-denied'],
]

function stderrDiagnostic(stderr) {
  const text = typeof stderr === 'string' ? stderr : ''
  if (text.trim() === '') return null
  for (const [pattern, label] of STDERR_DIAGNOSTICS) {
    if (pattern.test(text)) return label
  }
  return 'unknown'
}

/**
 * Parse `tailscale status --json` into the small projection DSH Native uses:
 * the machine's own MagicDNS name plus tailnet peers with stable names.
 * Returns null when the payload is not parseable.
 */
function parseTailscaleStatus(raw) {
  let value
  try { value = JSON.parse(raw) } catch { return null }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const self = value.Self && typeof value.Self === 'object' ? value.Self : {}
  const magicDnsName = normalizeMagicDnsName(self.DNSName)
  const selfAddresses = Array.isArray(self.TailscaleIPs)
    ? self.TailscaleIPs.filter(isTailscaleIpv4)
    : []
  const peers = []
  const peerMap = value.Peer
  if (peerMap && typeof peerMap === 'object') {
    for (const entry of Object.values(peerMap)) {
      if (!entry || typeof entry !== 'object') continue
      const dnsName = normalizeMagicDnsName(entry.DNSName)
      const addresses = Array.isArray(entry.TailscaleIPs)
        ? entry.TailscaleIPs.filter(isTailscaleIpv4)
        : []
      if (!dnsName && addresses.length === 0) continue
      peers.push({
        dnsName,
        hostName: typeof entry.HostName === 'string' && entry.HostName.trim() !== ''
          ? entry.HostName.trim().slice(0, 120)
          : null,
        ip: addresses[0] ?? null,
        online: entry.Online === true,
      })
    }
  }
  return { available: magicDnsName !== null || selfAddresses.length > 0, magicDnsName, selfAddresses, peers }
}

/**
 * Run `tailscale status --json` under a hard timeout.
 * Resolves { status, diagnostic } and never throws: a missing CLI, a login
 * prompt, or a timeout simply means tailnet features stay off.
 */
function readTailscaleStatus({ timeoutMs = DEFAULT_TIMEOUT_MS, platform = process.platform, spawnImpl = spawn } = {}) {
  return new Promise((resolve) => {
    let settled = false
    let timer = null
    let child = null
    let stdout = ''
    let stderr = ''
    const finish = (result) => {
      if (settled) return
      settled = true
      if (timer !== null) clearTimeout(timer)
      try { child?.kill() } catch { /* already gone */ }
      resolve(result)
    }
    // The timeout completes an active CLI operation and must remain a
    // referenced handle until the child exits or the deadline fires.
    timer = setTimeout(() => finish({ status: null, diagnostic: 'timeout' }), Math.max(1, timeoutMs))
    try {
      child = spawnImpl(tailscaleCommand(platform), ['status', '--json'], {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch {
      finish({ status: null, diagnostic: 'not-installed' })
      return
    }
    child.once('error', () => finish({ status: null, diagnostic: 'not-installed' }))
    child.stdout?.on('data', (chunk) => { stdout += chunk.toString() })
    child.stderr?.on('data', (chunk) => { stderr += chunk.toString() })
    child.once('exit', (code) => {
      if (code !== 0) {
        finish({ status: null, diagnostic: stderrDiagnostic(stderr) ?? 'unknown' })
        return
      }
      const parsed = parseTailscaleStatus(stdout)
      finish(parsed
        ? { status: parsed, diagnostic: null }
        : { status: null, diagnostic: 'unparsable' })
    })
  })
}

const DNS_LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i

function isValidDnsName(name) {
  if (typeof name !== 'string') return false
  const trimmed = name.trim().replace(/\.$/, '')
  if (trimmed.length === 0 || trimmed.length > 253) return false
  return trimmed.toLowerCase().split('.').every((label) => DNS_LABEL_PATTERN.test(label))
}

/** The canonical saved form for a tailnet device: MagicDNS over HTTPS. */
function magicDnsHttpsUrl(dnsName) {
  if (!isValidDnsName(dnsName)) return null
  return 'https://' + dnsName.trim().replace(/\.$/, '').toLowerCase() + '/'
}

/** Match a saved server URL against a tailnet peer by MagicDNS name or IP. */
function findPeerForHost(peers, hostUrl) {
  if (!Array.isArray(peers)) return null
  let hostname
  try { hostname = new URL(hostUrl).hostname.toLowerCase() } catch { return null }
  for (const peer of peers) {
    if (!peer) continue
    if (peer.dnsName && peer.dnsName.toLowerCase() === hostname) return peer
    if (peer.ip && String(peer.ip).toLowerCase() === hostname) return peer
  }
  return null
}

module.exports = {
  DEFAULT_TIMEOUT_MS,
  findPeerForHost,
  isTailscaleIpv4,
  isValidDnsName,
  magicDnsHttpsUrl,
  normalizeMagicDnsName,
  parseTailscaleStatus,
  readTailscaleStatus,
  stderrDiagnostic,
  tailscaleCommand,
}