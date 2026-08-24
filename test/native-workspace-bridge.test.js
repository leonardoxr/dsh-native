'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { allowedWorkspaceOrigins, assertWorkspaceSender, originOf } = require('../src/lib/native-workspace-bridge')

const LOCAL = 'http://127.0.0.1:3080/'
const HOSTS = [
  { id: 'remote', url: 'https://xavier.tail6fa18.ts.net/' },
  { id: 'invalid', url: 'not a URL' },
]

test('normalizes managed server URLs to origins', () => {
  assert.equal(originOf('https://example.test/path?q=1'), 'https://example.test')
  assert.equal(originOf('invalid'), null)
  assert.deepEqual([...allowedWorkspaceOrigins(LOCAL, HOSTS)], [
    'http://127.0.0.1:3080',
    'https://xavier.tail6fa18.ts.net',
  ])
})

test('accepts the managed local page and saved server pages', () => {
  assert.doesNotThrow(() => assertWorkspaceSender('http://127.0.0.1:3080/chat', LOCAL, HOSTS))
  assert.doesNotThrow(() => assertWorkspaceSender('https://xavier.tail6fa18.ts.net/session', LOCAL, HOSTS))
})

test('rejects arbitrary web and file pages', () => {
  assert.throws(() => assertWorkspaceSender('https://attacker.example/', LOCAL, HOSTS), /managed local server/)
  assert.throws(() => assertWorkspaceSender('file:///tmp/index.html', LOCAL, HOSTS), /managed local server/)
})
