'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')
const { NotificationFeed, validateNotification } = require('../src/lib/notification-feed')

function notification(overrides = {}) {
  return {
    version: 1,
    key: 'turn:session-1:4',
    kind: 'completed',
    sessionId: 'session-1',
    title: 'Build feature',
    body: 'The agent finished its turn.',
    at: 123,
    ...overrides,
  }
}

function sseResponse(body, options = {}) {
  const encoded = new TextEncoder().encode(body)
  return {
    status: options.status ?? 200,
    ok: options.ok ?? (options.status === undefined || options.status < 400),
    redirected: options.redirected ?? false,
    headers: new Headers({ 'content-type': options.contentType ?? 'text/event-stream; charset=utf-8' }),
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(encoded)
        controller.close()
      },
    }),
  }
}

test('validates the bounded companion notification contract', () => {
  assert.deepEqual(validateNotification(notification()), notification())
  assert.equal(validateNotification(notification({ version: 2 })), null)
  assert.equal(validateNotification(notification({ kind: 'shell-command' })), null)
  assert.equal(validateNotification(notification({ title: 'x'.repeat(121) })), null)
  assert.equal(validateNotification(notification({ at: Number.NaN })), null)
})

test('consumes SSE, remembers cursor, and deduplicates stable keys', async () => {
  const received = []
  const requests = []
  const feed = new NotificationFeed({ onNotification: value => received.push(value), logger: {} })
  const state = feed.stateFor('https://dsh.example')
  const lifetime = new AbortController()
  const payload = JSON.stringify(notification())
  let call = 0
  const fetchImpl = async (url, options) => {
    requests.push({ url, options })
    call += 1
    return sseResponse(call === 1
      ? 'id: instance:1\nevent: ready\ndata: {"version":1}\n\nid: instance:2\nevent: notification\ndata: ' + payload + '\n\n'
      : 'event: notification\ndata: ' + payload + '\n\n')
  }

  assert.equal(await feed.connect('https://dsh.example', state, fetchImpl, lifetime), true)
  assert.equal(state.cursor, 'instance:2')
  assert.equal(await feed.connect('https://dsh.example', state, fetchImpl, lifetime), true)
  assert.equal(received.length, 1)
  assert.equal(requests[0].url, 'https://dsh.example/api/companion/notifications')
  assert.equal(requests[0].options.credentials, 'include')
  assert.equal(requests[1].url, 'https://dsh.example/api/companion/notifications?since=instance%3A2')
  assert.equal(requests[1].options.headers['last-event-id'], 'instance:2')
})

test('rejects missing, unauthorized, redirected, and malformed feeds', async () => {
  const feed = new NotificationFeed({ onNotification() {}, logger: {} })
  const connect = response => feed.connect(
    'https://dsh.example',
    feed.stateFor('https://dsh.example'),
    async () => response,
    new AbortController(),
  )

  await assert.rejects(connect(sseResponse('', { status: 404, ok: false })), /does not provide/)
  await assert.rejects(connect(sseResponse('', { status: 403, ok: false })), /rejected/)
  await assert.rejects(connect(sseResponse('', { redirected: true })), /redirect/)
  await assert.rejects(connect(sseResponse('event: notification\ndata: {}\n\n')), /invalid payload/)
  await assert.rejects(connect(sseResponse('', { contentType: 'application/json' })), /returned application\/json/)
})

test('discards a partial notification at EOF without poisoning the feed', async () => {
  const received = []
  const feed = new NotificationFeed({ onNotification: value => received.push(value), logger: {} })
  const result = await feed.connect(
    'https://dsh.example',
    feed.stateFor('https://dsh.example'),
    async () => sseResponse('id: partial:1\nevent: notification\ndata: {"version":1'),
    new AbortController(),
  )
  assert.equal(result, false)
  assert.deepEqual(received, [])
})

test('ignores a queued old-host chunk after its lifetime is aborted', async () => {
  const received = []
  const feed = new NotificationFeed({ onNotification: value => received.push(value), logger: {} })
  const lifetime = new AbortController()
  let releaseRead
  const body = {
    getReader() {
      return {
        read() {
          return new Promise(resolve => { releaseRead = resolve })
        },
      }
    },
  }
  const response = {
    status: 200,
    ok: true,
    redirected: false,
    headers: new Headers({ 'content-type': 'text/event-stream' }),
    body,
  }
  const pending = feed.connect(
    'https://old.example',
    feed.stateFor('https://old.example'),
    async () => response,
    lifetime,
  )
  await new Promise(resolve => setImmediate(resolve))
  lifetime.abort()
  releaseRead({
    done: false,
    value: new TextEncoder().encode(
      'id: old:1\nevent: notification\ndata: ' + JSON.stringify(notification({ key: 'old' })) + '\n\n',
    ),
  })
  assert.equal(await pending, false)
  assert.deepEqual(received, [])
})

test('requires HTTPS and aborts the active generation on stop', async () => {
  const feed = new NotificationFeed({ onNotification() {}, logger: {} })
  assert.throws(() => feed.start('http://dsh.example', async () => {}), /https/)

  let signal
  feed.start('https://dsh.example/path', async (_url, options) => {
    signal = options.signal
    return new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true })
    })
  })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(signal.aborted, false)
  feed.stop()
  assert.equal(signal.aborted, true)
})
