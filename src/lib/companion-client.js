'use strict'

const COMPANION_WORKSPACES_PATH = '/api/companion/workspaces'
const COMPANION_SESSIONS_PATH = '/api/companion/sessions'
const DEFAULT_TIMEOUT_MS = 5000

class CompanionFetchError extends Error {
  constructor(reason, message, { httpStatus = null } = {}) {
    super(message)
    this.name = 'CompanionFetchError'
    this.reason = reason
    this.httpStatus = httpStatus
  }
}

// Saved hosts are HTTPS-only; plain HTTP is accepted exclusively for the
// managed local DSH Web origin, mirroring classifyNavigation().
function isFetchableOrigin(urlString) {
  let url
  try { url = new URL(urlString) } catch { return false }
  if (url.protocol === 'https:') return true
  if (url.protocol === 'http:' && url.hostname === '127.0.0.1' && url.port === '3080') return true
  return false
}

/**
 * Build an absolute Companion endpoint URL from a saved server URL.
 * The absolute endpoint path intentionally replaces any path on the base,
 * matching how the notification feed addresses Companion.
 */
function buildCompanionUrl(baseUrl, endpointPath = COMPANION_WORKSPACES_PATH) {
  if (!isFetchableOrigin(baseUrl)) return null
  try {
    return new URL(endpointPath, baseUrl).toString()
  } catch {
    return null
  }
}

function toMillis(value) {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return Math.round(value)
  if (typeof value === 'string' && value.length > 0) {
    const parsed = Date.parse(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function text(value, max) {
  return typeof value === 'string' ? value.slice(0, max) : null
}

/** Shape-validate one workspace row; invalid rows are dropped, not fatal. */
function validateWorkspaceItem(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const id = text(value.id, 256)
  const title = typeof value.title === 'string' ? value.title.slice(0, 200) : null
  const path = typeof value.path === 'string' ? value.path.slice(0, 1024) : null
  if (!id || title === null || path === null) return null
  const createdAt = toMillis(value.createdAt)
  const updatedAt = toMillis(value.updatedAt)
  if (createdAt === null || updatedAt === null) return null
  if (!Array.isArray(value.sessionIds)) return null
  const sessionIds = value.sessionIds
    .filter((s) => typeof s === 'string' && s.length > 0 && s.length <= 256)
  return { id, title, path, createdAt, updatedAt, sessionIds }
}

function validateWorkspacesPayload(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  if (!Array.isArray(value.workspaces)) return null
  return value.workspaces.map(validateWorkspaceItem).filter(Boolean)
}

function validateSessionItem(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const id = text(value.id, 256)
  if (!id) return null
  const createdAt = toMillis(value.createdAt)
  const updatedAt = toMillis(value.updatedAt) ?? createdAt
  if (createdAt === null || updatedAt === null) return null
  return {
    id,
    title: typeof value.title === 'string' ? value.title.slice(0, 200) : null,
    cwd: typeof value.cwd === 'string' ? value.cwd.slice(0, 1024) : null,
    createdAt,
    updatedAt,
  }
}

function validateSessionsPayload(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  if (!Array.isArray(value.sessions)) return null
  return value.sessions.map(validateSessionItem).filter(Boolean)
}

function sameOrigin(urlStringA, urlStringB) {
  try {
    return new URL(urlStringA).origin === new URL(urlStringB).origin
  } catch {
    return false
  }
}

function classifyNetworkError(error) {
  const code = String(error?.cause?.code ?? error?.code ?? '')
  if (/ENOTFOUND|EAI_AGAIN/.test(code)) return new CompanionFetchError('dns', 'The server host could not be resolved.')
  if (code === 'ECONNREFUSED') return new CompanionFetchError('refused', 'The server refused the connection.')
  if (/CERT|TLS|SSL|SELF_SIGNED|LEAF_SIGNATURE|ALTNAME/i.test(code)) return new CompanionFetchError('tls', 'TLS certificate validation failed.')
  if (/ECONNRESET|EPIPE|ETIMEDOUT|UND_ERR|EHOSTUNREACH|ENETUNREACH/.test(code)) return new CompanionFetchError('network', 'The connection failed.')
  const raw = String(error?.message ?? '')
  return new CompanionFetchError('network', raw.length > 0 ? raw.slice(0, 200) : 'The request failed.')
}

/** GET one JSON endpoint with a hard timeout; throws CompanionFetchError. */
async function fetchJsonWithTimeout(url, { fetchImpl, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function')
  const controller = new AbortController()
  // This timeout belongs to an active request, so it must keep the
  // process alive long enough to reject a stalled fetch.
  const timer = setTimeout(() => controller.abort(new Error('timeout')), Math.max(1, timeoutMs))
  try {
    const response = await fetchImpl(url, {
      credentials: 'include',
      headers: { accept: 'application/json' },
      signal: controller.signal,
    })
    const finalUrl = response?.url || url
    if (response?.redirected || !sameOrigin(finalUrl, url)) {
      throw new CompanionFetchError('redirect', 'The Companion endpoint redirected to another origin.')
    }
    if (response.status === 403) throw new CompanionFetchError('unauthorized', 'Companion rejected this authority.', { httpStatus: 403 })
    if (response.status === 404) throw new CompanionFetchError('not-found', 'No dsh-companion plugin is installed on this server.', { httpStatus: 404 })
    if (!response.ok) throw new CompanionFetchError('http-status', 'Companion returned HTTP ' + response.status + '.', { httpStatus: response.status })
    const contentType = String(response.headers?.get?.('content-type') ?? '')
    if (contentType !== '' && !/json/i.test(contentType)) {
      throw new CompanionFetchError('unexpected-content', 'The Companion endpoint returned ' + contentType + '.')
    }
    return await response.json()
  } catch (error) {
    if (error instanceof CompanionFetchError) throw error
    if (error?.name === 'AbortError' || controller.signal.aborted) {
      throw new CompanionFetchError('timeout', 'The server did not respond in time.')
    }
    throw classifyNetworkError(error)
  } finally {
    clearTimeout(timer)
  }
}

async function fetchCompanionEndpoint(baseUrl, endpointPath, options = {}) {
  const url = buildCompanionUrl(baseUrl, endpointPath)
  if (!url) throw new CompanionFetchError('invalid-url', 'This saved server URL cannot host Companion endpoints.')
  return fetchJsonWithTimeout(url, options)
}

async function fetchSide(baseUrl, endpointPath, validate, options) {
  try {
    const raw = await fetchCompanionEndpoint(baseUrl, endpointPath, options)
    const rows = validate(raw)
    if (!rows) throw new CompanionFetchError('invalid-payload', 'Companion sent an unexpected payload.')
    return { ok: true, rows }
  } catch (error) {
    return { ok: false, error }
  }
}

/**
 * Fetch workspaces and sessions for one server.
 * Resolves instead of throwing; `ok` reflects the primary workspaces read,
 * while a failed sessions read degrades enrichment only.
 */
async function fetchCompanionServerData(baseUrl, options = {}) {
  const shared = { fetchImpl: options.fetchImpl, timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS }
  const [workspaces, sessions] = await Promise.all([
    fetchSide(baseUrl, COMPANION_WORKSPACES_PATH, validateWorkspacesPayload, shared),
    fetchSide(baseUrl, COMPANION_SESSIONS_PATH, validateSessionsPayload, shared),
  ])
  return {
    ok: workspaces.ok,
    workspaces: workspaces.rows ?? null,
    sessions: sessions.rows ?? null,
    failure: workspaces.ok ? (sessions.ok ? null : sessions.error) : workspaces.error,
  }
}

/** Classify whether a failure looks like the device being simply unreachable. */
function isConnectivityFailure(failure) {
  return failure instanceof CompanionFetchError
    && ['dns', 'refused', 'timeout', 'network'].includes(failure.reason)
}

async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length)
  let next = 0
  const size = Math.max(1, Math.min(limit, items.length))
  const workers = Array.from({ length: size }, async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await fn(items[index], index)
    }
  })
  await Promise.all(workers)
  return results
}

/** Probe one candidate server; resolves a readiness label, never throws. */
async function probeCompanionCandidate(baseUrl, options = {}) {
  try {
    await fetchCompanionEndpoint(baseUrl, COMPANION_WORKSPACES_PATH, options)
    return 'ready'
  } catch (error) {
    if (error instanceof CompanionFetchError && error.reason === 'unauthorized') return 'unauthorized'
    return 'unreachable'
  }
}

async function probeCandidates(baseUrls, { fetchImpl, timeoutMs = 3500, concurrency = 4 } = {}) {
  return mapWithConcurrency(baseUrls, concurrency, (baseUrl) =>
    probeCompanionCandidate(baseUrl, { fetchImpl, timeoutMs }))
}

module.exports = {
  COMPANION_WORKSPACES_PATH,
  COMPANION_SESSIONS_PATH,
  CompanionFetchError,
  buildCompanionUrl,
  fetchCompanionServerData,
  probeCandidates,
  isConnectivityFailure,
  validateWorkspacesPayload,
  validateSessionsPayload,
}