'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')
const { SseParser } = require('../src/lib/sse-parser')

const encode = value => new TextEncoder().encode(value)

test('parses split CRLF events, ids, multiline data, and retry', () => {
  const events = []
  const parser = new SseParser(event => events.push(event))
  parser.push(encode('id: host:1\r\nevent: notifi'))
  parser.push(encode('cation\r\nretry: 10\r\ndata: {"a":'))
  parser.push(encode('1}\r\ndata: tail\r\n\r\n'))

  assert.deepEqual(events, [{
    type: 'notification',
    data: '{"a":1}\ntail',
    id: 'host:1',
    retryMs: 1000,
  }])
})

test('ignores comments and carries the latest event id', () => {
  const events = []
  const parser = new SseParser(event => events.push(event))
  parser.push(encode(': heartbeat\n\nid: cursor\ndata: ready\n\ndata: next\n\n'))
  assert.deepEqual(events.map(event => [event.id, event.data]), [
    ['cursor', 'ready'],
    ['cursor', 'next'],
  ])
})


test('discards an event cut off before its blank-line terminator', () => {
  const events = []
  const parser = new SseParser(event => events.push(event))
  parser.push(encode('id: cursor\nevent: notification\ndata: {"partial":'))
  parser.finish()
  assert.deepEqual(events, [])
})

test('accepts mixed CR, LF, and CRLF line endings', () => {
  const events = []
  const parser = new SseParser(event => events.push(event))
  parser.push(encode('event: first\ndata: one\n\r\nevent: second\rdata: two\r\r'))
  parser.finish()
  assert.deepEqual(events.map(event => [event.type, event.data]), [
    ['first', 'one'],
    ['second', 'two'],
  ])
})

test('rejects oversized events and malformed utf-8', () => {
  const parser = new SseParser(() => {}, { maxBuffer: 20, maxEvent: 5 })
  assert.throws(() => parser.push(encode('data: too-long\n\n')), /size limit/)

  const invalid = new SseParser(() => {})
  assert.throws(() => invalid.push(Uint8Array.from([0xff, 0xff])), /encoded data|UTF-8|valid/i)
})
