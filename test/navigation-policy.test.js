'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { classifyNavigation } = require('../src/lib/navigation-policy')

test('allows HTTPS navigation within the selected origin', () => {
  assert.deepEqual(classifyNavigation('https://example.com', 'https://example.com/projects?id=1'), {
    action: 'allow',
    url: 'https://example.com/projects?id=1',
  })
})

test('sends cross-origin HTTPS navigation to the system browser', () => {
  assert.deepEqual(classifyNavigation('https://example.com', 'https://docs.example.com/'), {
    action: 'external',
    url: 'https://docs.example.com/',
  })
  assert.equal(classifyNavigation(undefined, 'https://example.com/').action, 'external')
})

test('allows the managed local DSH Web origin', () => {
  assert.deepEqual(classifyNavigation('http://127.0.0.1:3080', 'http://127.0.0.1:3080/projects'), {
    action: 'allow',
    url: 'http://127.0.0.1:3080/projects',
  })
  assert.equal(classifyNavigation('http://127.0.0.1:3080', 'http://127.0.0.1:3081/').action, 'deny')
})

test('denies malformed and non-HTTPS navigation', () => {
  assert.deepEqual(classifyNavigation('https://example.com', 'http://example.com/'), {
    action: 'deny',
    url: null,
  })
  assert.equal(classifyNavigation('https://example.com', 'javascript:alert(1)').action, 'deny')
})
