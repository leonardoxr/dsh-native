'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { localDshArgs, localDshCommand, localDshLaunchSpec } = require('../src/lib/local-dsh')

test('spawns the platform-specific dsh command directly', () => {
  assert.equal(localDshCommand('win32'), 'dsh.cmd')
  assert.equal(localDshCommand('darwin'), 'dsh')
  assert.equal(localDshCommand('linux'), 'dsh')
})

test('launches dsh web on port 3080 without opening a browser', () => {
  assert.deepEqual(localDshArgs(), ['web', '--port', '3080', '--no-open'])
})

test('uses cmd.exe for Windows but launches dsh directly on macOS and Linux', () => {
  const windows = localDshLaunchSpec('win32', 'C:\\Windows\\System32\\cmd.exe')
  assert.equal(windows.command, 'C:\\Windows\\System32\\cmd.exe')
  assert.deepEqual(windows.args, ['/d', '/s', '/c', 'dsh.cmd', 'web', '--port', '3080', '--no-open'])
  assert.equal(localDshLaunchSpec('darwin').command, 'dsh')
  assert.equal(localDshLaunchSpec('linux').command, 'dsh')
})
