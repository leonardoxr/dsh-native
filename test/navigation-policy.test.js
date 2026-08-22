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

test('denies malformed and non-HTTPS navigation', () => {
  assert.deepEqual(classifyNavigation('https://example.com', 'http://example.com/'), {
    action: 'deny',
    url: null,
  })
  assert.equal(classifyNavigation('https://example.com', 'javascript:alert(1)').action, 'deny')
})
