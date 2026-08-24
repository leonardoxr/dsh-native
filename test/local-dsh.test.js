'use strict'

const path = require('node:path')
const test = require('node:test')
const assert = require('node:assert/strict')
const { localDshArgs, localDshCommand, localDshLaunchSpec } = require('../src/lib/local-dsh')

test('spawns the platform-specific dsh command directly', () => {
  assert.equal(localDshCommand('win32'), 'dsh.cmd')
  assert.match(localDshCommand('darwin'), /(?:^|[\\/])dsh$/)
  assert.equal(localDshCommand('linux', { pathValue: '', executable: () => false }), 'dsh')
})

test('launches dsh web on port 3080 without opening a browser', () => {
  assert.deepEqual(localDshArgs(), ['web', '--port', '3080', '--no-open'])
})

test('uses cmd.exe for Windows but launches dsh directly on macOS and Linux', () => {
  const windows = localDshLaunchSpec('win32', 'C:\\Windows\\System32\\cmd.exe')
  assert.equal(windows.command, 'C:\\Windows\\System32\\cmd.exe')
  assert.deepEqual(windows.args, ['/d', '/s', '/c', 'dsh.cmd', 'web', '--port', '3080', '--no-open'])
  assert.match(localDshLaunchSpec('darwin').command, /(?:^|[\\/])dsh$/)
  assert.equal(localDshLaunchSpec('linux', undefined, { pathValue: '', executable: () => false }).command, 'dsh')
})

test('resolves Homebrew dsh and Node when the GUI PATH has neither', () => {
  const executableFiles = new Set([
    '/opt/homebrew/bin/dsh',
    '/opt/homebrew/opt/node/bin/node',
  ])
  const launch = localDshLaunchSpec('darwin', undefined, {
    pathValue: '/usr/bin',
    environment: { PATH: '/usr/bin' },
    executable: (file) => executableFiles.has(file),
  })

  assert.equal(launch.command, '/opt/homebrew/bin/dsh')
  assert.deepEqual(launch.options.env.PATH.split(path.delimiter).slice(0, 2), [
    '/opt/homebrew/opt/node/bin',
    '/opt/homebrew/bin',
  ])
})

test('prefers the supported Homebrew Node path over an older GUI PATH entry', () => {
  const launch = localDshLaunchSpec('darwin', undefined, {
    pathValue: '/opt/homebrew/opt/node@20/bin:/usr/bin',
    environment: { PATH: '/opt/homebrew/opt/node@20/bin:/usr/bin' },
    executable: (file) => [
      '/opt/homebrew/bin/dsh',
      '/opt/homebrew/opt/node/bin/node',
      '/opt/homebrew/opt/node@20/bin/node',
    ].includes(file),
  })

  assert.equal(launch.command, '/opt/homebrew/bin/dsh')
  assert.equal(launch.options.env.PATH.split(path.delimiter)[0], '/opt/homebrew/opt/node/bin')
})
