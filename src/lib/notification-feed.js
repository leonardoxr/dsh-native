'use strict'

const { SseParser } = require('./sse-parser')

const KINDS = new Set(['completed', 'blocked', 'error', 'max-tokens', 'aborted', 'question', 'approval'])
const MAX_SEEN = 512
const STALE_AFTER_MS = 45_000

class TerminalFeedError extends Error {}

function validateNotification(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  if (value.version !== 1 || !KINDS.has(value.kind)) return null
  if (typeof value.key !== 'string' || value.key.length < 1 || value.key.length > 256) return null
  if (typeof value.sessionId !== 'string' || value.sessionId.length < 1 || value.sessionId.length > 256) return null
  if (typeof value.title !== 'string' || value.title.length < 1 || value.title.length > 120) return null
  if (typeof value.body !== 'string' || value.body.length > 320) return null
  if (!Number.isFinite(value.at) || value.at < 0) return null
  return {
    version: 1,
    key: value.key,
    kind: value.kind,
    sessionId: value.sessionId,
    title: value.title,
    body: value.body,
    at: value.at,
  }
}

class NotificationFeed {
  constructor(options) {
    if (typeof options?.onNotification !== 'function') {
      throw new TypeError('onNotification must be a function')
    }
    this.onNotification = options.onNotification
    this.logger = options.logger ?? console
    this.setTimeout = options.setTimeout ?? setTimeout
    this.clearTimeout = options.clearTimeout ?? clearTimeout
    this.states = new Map()
    this.generation = 0
    this.lifetime = null
    this.retryTimer = null
  }

  start(hostUrl, fetchImpl) {
    if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function')
    const url = new URL(hostUrl)
    if (url.protocol !== 'https:') throw new Error('Notification feeds require an https:// host')

    this.stop()
    const generation = this.generation
    const lifetime = new AbortController()
    this.lifetime = lifetime
    const origin = url.origin
    const state = this.stateFor(origin)
    void this.run(generation, origin, state, fetchImpl, lifetime)
  }

  stop() {
    this.generation += 1
    this.lifetime?.abort()
    this.lifetime = null
    if (this.retryTimer !== null) {
      this.clearTimeout(this.retryTimer)
      this.retryTimer = null
    }
  }

  stateFor(origin) {
    let state = this.states.get(origin)
    if (!state) {
      state = { cursor: '', seen: new Set(), order: [] }
      this.states.set(origin, state)
    }
    return state
  }

  remember(state, key) {
    if (state.seen.has(key)) return false
    state.seen.add(key)
    state.order.push(key)
    if (state.order.length > MAX_SEEN) state.seen.delete(state.order.shift())
    return true
  }

  async run(generation, origin, state, fetchImpl, lifetime) {
    let attempt = 0
    let serverRetryMs
    while (generation === this.generation && !lifetime.signal.aborted) {
      try {
        const received = await this.connect(origin, state, fetchImpl, lifetime)
        if (received) attempt = 0
        throw new Error('Companion notification stream ended')
      } catch (error) {
        if (generation !== this.generation || lifetime.signal.aborted) return
        if (error instanceof TerminalFeedError) {
          this.logger.info?.(error.message)
          return
        }
        const retryFromError = Number.isFinite(error?.retryMs) ? error.retryMs : undefined
        serverRetryMs = retryFromError ?? serverRetryMs
        const base = serverRetryMs ?? Math.min(30_000, 1_000 * 2 ** Math.min(attempt, 5))
        const delay = Math.max(250, Math.round(base * (0.75 + Math.random() * 0.5)))
        attempt += 1
        this.logger.warn?.(
          'DSH notification feed disconnected; retrying in ' + delay + 'ms',
          error instanceof Error ? error.message : error,
        )
        await this.wait(delay, lifetime.signal)
      }
    }
  }

  async connect(origin, state, fetchImpl, lifetime) {
    const endpoint = new URL('/api/companion/notifications', origin)
    if (state.cursor !== '') endpoint.searchParams.set('since', state.cursor)

    const connection = new AbortController()
    const stopConnection = () => connection.abort()
    lifetime.signal.addEventListener('abort', stopConnection, { once: true })
    let staleTimer = null
    let received = false
    let parser

    const touch = () => {
      if (staleTimer !== null) this.clearTimeout(staleTimer)
      staleTimer = this.setTimeout(() => connection.abort(new Error('Notification feed heartbeat timed out')), STALE_AFTER_MS)
      staleTimer.unref?.()
    }

    try {
      const response = await fetchImpl(endpoint.href, {
        credentials: 'include',
        headers: {
          accept: 'text/event-stream',
          ...(state.cursor === '' ? {} : { 'last-event-id': state.cursor }),
        },
        redirect: 'manual',
        signal: connection.signal,
      })

      if (response.status === 404) {
        throw new TerminalFeedError('Installed dsh-companion does not provide native notifications')
      }
      if (response.redirected || (response.status >= 300 && response.status < 400)) {
        throw new TerminalFeedError('DSH notification feed refused an HTTP redirect')
      }
      if (response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429) {
        throw new TerminalFeedError('DSH notification feed was rejected (' + response.status + ')')
      }
      if (!response.ok) throw new Error('DSH notification feed returned HTTP ' + response.status)
      const contentType = response.headers.get('content-type') ?? ''
      if (!/^text\/event-stream(?:;|$)/i.test(contentType)) {
        throw new TerminalFeedError('DSH notification feed returned ' + (contentType || 'an unknown content type'))
      }
      if (!response.body) throw new Error('DSH notification feed has no response body')

      parser = new SseParser((event) => {
        if (lifetime.signal.aborted) return
        received = true
        if (event.id !== '') state.cursor = event.id
        if (event.type !== 'notification') return

        let value
        try {
          value = JSON.parse(event.data)
        } catch {
          throw new TerminalFeedError('DSH notification feed sent invalid JSON')
        }
        const notification = validateNotification(value)
        if (!notification) throw new TerminalFeedError('DSH notification feed sent an invalid payload')
        if (!this.remember(state, notification.key)) return
        try {
          this.onNotification(notification)
        } catch (error) {
          this.logger.warn?.('Failed to present a DSH notification', error)
        }
      })

      const reader = response.body.getReader()
      touch()
      while (true) {
        const { done, value } = await reader.read()
        if (lifetime.signal.aborted) return received
        if (done) break
        touch()
        parser.push(value)
      }
      parser.finish()
      if (parser.retryMs !== undefined) {
        const error = new Error('Companion notification stream ended')
        error.retryMs = parser.retryMs
        throw error
      }
      return received
    } finally {
      if (staleTimer !== null) this.clearTimeout(staleTimer)
      lifetime.signal.removeEventListener('abort', stopConnection)
      connection.abort()
    }
  }

  wait(delay, signal) {
    return new Promise(resolve => {
      if (signal.aborted) return resolve()
      const done = () => {
        if (this.retryTimer !== null) this.clearTimeout(this.retryTimer)
        this.retryTimer = null
        signal.removeEventListener('abort', done)
        resolve()
      }
      this.retryTimer = this.setTimeout(done, delay)
      this.retryTimer.unref?.()
      signal.addEventListener('abort', done, { once: true })
    })
  }
}

module.exports = { NotificationFeed, validateNotification }
