'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { localDshArgs, localDshCommand } = require('../src/lib/local-dsh')

test('spawns the platform-specific dsh command directly', () => {
  assert.equal(localDshCommand('win32'), 'dsh.cmd')
  assert.equal(localDshCommand('darwin'), 'dsh')
  assert.equal(localDshCommand('linux'), 'dsh')
})

test('launches dsh web on port 3080 without opening a browser', () => {
  assert.deepEqual(localDshArgs(), ['web', '--port', '3080', '--no-open'])
})
