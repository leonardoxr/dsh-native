'use strict'

const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const test = require('node:test')
const { createNotificationPresenter } = require('../src/lib/notification-presenter')

class FakeNotification extends EventEmitter {
  static supported = true
  static instances = []

  static isSupported() {
    return this.supported
  }

  constructor(options) {
    super()
    this.options = options
    this.shown = false
    FakeNotification.instances.push(this)
  }

  show() {
    this.shown = true
  }
}

function fakeWindow(overrides = {}) {
  const calls = []
  return {
    calls,
    isDestroyed: () => false,
    isFocused: () => false,
    isMinimized: () => false,
    isVisible: () => true,
    restore: () => calls.push('restore'),
    show: () => calls.push('show'),
    focus: () => calls.push('focus'),
    ...overrides,
  }
}

const payload = { title: 'Session title', body: 'The agent finished.' }

test.beforeEach(() => {
  FakeNotification.supported = true
  FakeNotification.instances = []
})

test('suppresses alerts while the app is focused', () => {
  const win = fakeWindow({ isFocused: () => true })
  const present = createNotificationPresenter({ Notification: FakeNotification, getWindow: () => win })
  assert.equal(present(payload), false)
  assert.equal(FakeNotification.instances.length, 0)
})

test('shows alerts and focuses the window when clicked', () => {
  const win = fakeWindow({ isMinimized: () => true, isVisible: () => false })
  const present = createNotificationPresenter({ Notification: FakeNotification, getWindow: () => win })
  assert.equal(present(payload), true)

  const item = FakeNotification.instances[0]
  assert.deepEqual(item.options, payload)
  assert.equal(item.shown, true)
  item.emit('click')
  assert.deepEqual(win.calls, ['restore', 'show', 'focus'])
})

test('does not instantiate unsupported notifications and tolerates a destroyed click target', () => {
  const warnings = []
  FakeNotification.supported = false
  const present = createNotificationPresenter({
    Notification: FakeNotification,
    getWindow: () => null,
    logger: { warn: message => warnings.push(message) },
  })
  assert.equal(present(payload), false)
  assert.equal(present(payload), false)
  assert.equal(warnings.length, 1)

  FakeNotification.supported = true
  let win = null
  const second = createNotificationPresenter({ Notification: FakeNotification, getWindow: () => win })
  second(payload)
  win = fakeWindow({ isDestroyed: () => true })
  assert.doesNotThrow(() => FakeNotification.instances[0].emit('click'))
})
