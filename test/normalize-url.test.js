'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { normalizeUrl } = require('../src/lib/normalize-url')

test('normalizes valid HTTPS URLs', () => {
  assert.equal(normalizeUrl('  https://example.com/path  '), 'https://example.com/path')
  assert.equal(normalizeUrl('https://example.com'), 'https://example.com/')
})

test('rejects non-HTTPS and malformed URLs', () => {
  assert.equal(normalizeUrl('http://example.com'), null)
  assert.equal(normalizeUrl('file:///tmp/example'), null)
  assert.equal(normalizeUrl('not a URL'), null)
})
