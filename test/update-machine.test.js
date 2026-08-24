'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const machine = require('../src/lib/update-machine')

const BASE = machine.createInitialUpdateState('1.0.0', 'stable', { hostArch: 'x64', appArch: 'x64' })

test('initial state is disabled with no versions or errors', () => {
  assert.equal(BASE.enabled, false)
  assert.equal(BASE.status, 'disabled')
  assert.equal(BASE.availableVersion, null)
  assert.equal(BASE.downloadedVersion, null)
  assert.equal(BASE.canRetry, false)
})

test('base state builder can override the channel', () => {
  const next = machine.createBaseUpdateState({ ...BASE, channel: 'stable' }, true, 'prerelease')
  assert.equal(next.channel, 'prerelease')
  assert.equal(next.status, 'idle')
  assert.equal(next.enabled, true)
})

test('check start clears stale results but preserves a downloaded update', () => {
  const checking = machine.onCheckStart(BASE, 't1')
  assert.equal(checking.status, 'checking')
  assert.deepEqual(checking.releaseNotes, [])

  const downloaded = machine.onDownloadComplete(BASE, '1.1.0', 't0')
  const recheck = machine.onCheckStart(downloaded, 't2')
  assert.equal(recheck.status, 'checking')
  assert.equal(recheck.downloadPercent, 100)
  assert.deepEqual(recheck.releaseNotes, downloaded.releaseNotes)
})

test('check failure keeps a downloaded update installable and retryable', () => {
  const downloaded = machine.onDownloadComplete(BASE, '1.1.0', 't0')
  const failed = machine.onCheckFailure(downloaded, 'network down', 't1')
  assert.equal(failed.status, 'downloaded')
  assert.equal(failed.canRetry, true)

  const plainFailure = machine.onCheckFailure(BASE, 'network down', 't1')
  assert.equal(plainFailure.status, 'error')
  assert.equal(plainFailure.errorContext, 'check')
  assert.equal(plainFailure.canRetry, true)
})

test('update available transitions and downloaded-version recognition', () => {
  const available = machine.onUpdateAvailable(BASE, '1.1.0', 't1', [{ version: '1.1.0', items: ['Fix'] }])
  assert.equal(available.status, 'available')
  assert.equal(available.downloadPercent, null)

  const downloaded = machine.onDownloadComplete(BASE, '1.1.0', 't0')
  const again = machine.onUpdateAvailable(downloaded, '1.1.0', 't2', [])
  assert.equal(again.status, 'downloaded')
  assert.deepEqual(again.releaseNotes, downloaded.releaseNotes)
  assert.equal(again.canRetry, true)
})

test('no-update keeps a downloaded update but resets a clean app', () => {
  const downloaded = machine.onDownloadComplete(BASE, '1.1.0', 't0')
  const kept = machine.onNoUpdate(downloaded, 't1')
  assert.equal(kept.status, 'downloaded')
  assert.equal(kept.availableVersion, '1.1.0')

  const clean = machine.onNoUpdate(BASE, 't1')
  assert.equal(clean.status, 'up-to-date')
  assert.equal(clean.availableVersion, null)
  assert.equal(clean.canRetry, false)
})

test('download failure returns to available or errors depending on history', () => {
  const available = machine.onUpdateAvailable(BASE, '1.1.0', 't1')
  const failedAfterAnnounce = machine.onDownloadFailure(
    machine.onDownloadStart(available),
    'disk full',
  )
  assert.equal(failedAfterAnnounce.status, 'available')
  assert.equal(failedAfterAnnounce.errorContext, 'download')
  assert.equal(failedAfterAnnounce.canRetry, true)

  const failedCold = machine.onDownloadFailure(machine.onDownloadStart(BASE), 'disk full')
  assert.equal(failedCold.status, 'error')
  assert.equal(failedCold.canRetry, false)
})

test('progress broadcasts throttle to ten-percent steps except completion', () => {
  const downloading = machine.onDownloadProgress(machine.onDownloadStart(BASE), 5)
  assert.equal(machine.shouldBroadcastDownloadProgress(downloading, 6), false)
  assert.equal(machine.shouldBroadcastDownloadProgress(downloading, 10), true)
  assert.equal(machine.shouldBroadcastDownloadProgress(downloading, 100), true)

  // A state outside downloading always repaints (e.g. error recovery paths).
  assert.equal(machine.shouldBroadcastDownloadProgress(BASE, 42), true)
})

test('install failure lands back on the downloaded state as retryable', () => {
  const downloaded = machine.onDownloadComplete(BASE, '1.1.0', 't0')
  const failed = machine.onInstallFailure(downloaded, 'installer exited 3')
  assert.equal(failed.status, 'downloaded')
  assert.equal(failed.errorContext, 'install')
  assert.equal(failed.message, 'installer exited 3')
  assert.equal(failed.canRetry, true)
})
