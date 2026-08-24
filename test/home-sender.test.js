'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { isHomeSender, assertHomeSender } = require('../src/lib/home-sender')

const HOME = 'file:///C:/app/src/renderer/index.html'

test('allows the exact bundled home-screen frame URL', () => {
  assert.equal(isHomeSender(HOME, HOME), true)
  assert.doesNotThrow(() => assertHomeSender(HOME, HOME))
})

test('denies remote pages from reaching Workspaces IPC', () => {
  assert.equal(isHomeSender('https://evil.example/', HOME), false)
  assert.equal(isHomeSender('https://127.0.0.1:3080/', HOME), false)
})

test('denies every other file document', () => {
  assert.equal(isHomeSender('file:///C:/other.html', HOME), false)
  assert.equal(isHomeSender(HOME + '?x=1', HOME), false)
  assert.equal(isHomeSender(undefined, HOME), false)
  assert.equal(isHomeSender('', HOME), false)
})

test('assertHomeSender throws a coded error for foreign frames', () => {
  try {
    assertHomeSender('https://example.com/', HOME)
    assert.fail('should have thrown')
  } catch (error) {
    assert.equal(error.code, 'DSH_NATIVE_HOME_ONLY')
  }
})
