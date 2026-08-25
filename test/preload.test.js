'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const vm = require('node:vm')

function loadPreload(protocol) {
  const exposed = new Map()
  const isolated = new Map()
  const invoked = []
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'preload.js'), 'utf8')
  const sandbox = {
    require(name) {
      assert.equal(name, 'electron')
      return {
        contextBridge: {
          exposeInMainWorld(name, value) {
            exposed.set(name, value)
          },
          exposeInIsolatedWorld(worldId, name, value) {
            assert.equal(worldId, 999)
            isolated.set(name, value)
          },
        },
        ipcRenderer: {
          invoke(channel, ...args) {
            invoked.push({ channel, args })
            return Promise.resolve({ channel, args })
          },
          on() {},
          removeListener() {},
        },
      }
    },
    window: { location: { protocol } },
  }
  vm.runInNewContext(source, sandbox, { filename: 'src/preload.js' })
  return { exposed, isolated, invoked }
}

test('preload exposes every narrow bridge before target navigation commits', async () => {
  const { exposed, isolated, invoked } = loadPreload('about:')

  assert.deepEqual([...exposed.keys()], ['dshNative', 'dshNativeWorkspaces', 'dshNativeUpdate'])
  assert.deepEqual([...isolated.keys()], ['dshNative', 'dshNativeWorkspaces', 'dshNativeUpdate'])
  await exposed.get('dshNativeWorkspaces').getSnapshot()
  assert.deepEqual(invoked[0], { channel: 'workspace-sidebar:snapshot', args: [] })
})

test('preload exposes the same bridge faces for managed pages', () => {
  const { exposed, isolated } = loadPreload('https:')
  assert.deepEqual([...exposed.keys()], ['dshNative', 'dshNativeWorkspaces', 'dshNativeUpdate'])
  assert.deepEqual([...isolated.keys()], ['dshNative', 'dshNativeWorkspaces', 'dshNativeUpdate'])
})
