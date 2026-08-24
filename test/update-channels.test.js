'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { CHANNELS, isAllowedChannel, isPrereleaseVersion, resolveDefaultUpdateChannel } = require('../src/lib/update-channels')

test('channel catalogue is stable and validated', () => {
  assert.deepEqual(CHANNELS, ['stable', 'prerelease'])
  assert.equal(isAllowedChannel('stable'), true)
  assert.equal(isAllowedChannel('prerelease'), true)
  assert.equal(isAllowedChannel('nightly'), false)
  assert.equal(isAllowedChannel(undefined), false)
})

test('prerelease detection follows semver prerelease segments', () => {
  assert.equal(isPrereleaseVersion('1.2.0-beta.3'), true)
  assert.equal(isPrereleaseVersion('1.2.0-rc.1'), true)
  assert.equal(isPrereleaseVersion('v0.3.0-nightly.20260824.1'), true)
  assert.equal(isPrereleaseVersion('1.2.0'), false)
  assert.equal(isPrereleaseVersion('v1.2.0'), false)
  assert.equal(isPrereleaseVersion(''), false)
  assert.equal(isPrereleaseVersion(undefined), false)
})

test('default channel derives from the running version shape', () => {
  assert.equal(resolveDefaultUpdateChannel('0.3.0'), 'stable')
  assert.equal(resolveDefaultUpdateChannel('0.3.0-beta.1'), 'prerelease')
})
