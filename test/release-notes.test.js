'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { normalizeReleaseNotes } = require('../src/lib/release-notes')

test('string payloads wrap under the fallback version', () => {
  const notes = normalizeReleaseNotes('<p>Added dark mode</p>', '1.1.0')
  assert.equal(notes.length, 1)
  assert.equal(notes[0].version, '1.1.0')
  assert.deepEqual(notes[0].items, ['Added dark mode'])
})

test('html markup, entities, and markdown are stripped to plain items', () => {
  const note =
    '<h2>What\'s Changed</h2><ul><li>Fix crash on &amp; in URLs by @someone</li>' +
    '<li>Add <strong>tailscale</strong> discovery — see [docs](https://example.com/a)</li></ul>'
  const notes = normalizeReleaseNotes([{ version: '1.2.0', note }], '1.0.0')
  assert.equal(notes.length, 1)
  assert.deepEqual(notes[0].items, [
    'Fix crash on & in URLs by @someone',
    'Add tailscale discovery — see docs',
  ])
})

test('boilerplate headers are skipped while real bullets survive', () => {
  // Faithful to T3 Code: section headers (What's Changed / New Contributors)
  // are dropped, but content bullets underneath them still surface.
  const note = [
    '## What\'s Changed',
    '* Real change one',
    '1. Real change two',
    '',
    '## New Contributors',
    '* Someone joined',
    '**Full Changelog**: https://github.com/x/y/compare/v1.0.0...v1.1.0',
  ].join('\n')
  const notes = normalizeReleaseNotes(note, '1.1.0')
  assert.deepEqual(notes[0].items, ['Real change one', 'Real change two', 'Someone joined'])
})

test('oversized items truncate with an ellipsis at the cap', () => {
  const long = 'x'.repeat(400)
  const notes = normalizeReleaseNotes(long, '1.0.0')
  assert.equal(notes[0].items[0].length, 220)
  assert.ok(notes[0].items[0].endsWith('...'))
})

test('group and item counts stay bounded', () => {
  const groups = []
  for (let v = 0; v < 10; v++) {
    const items = []
    for (let i = 0; i < 20; i++) items.push('item ' + v + '-' + i)
    groups.push({ version: '1.' + v + '.0', note: '<li>' + items.join('</li><li>') + '</li>' })
  }
  const notes = normalizeReleaseNotes(groups, '0.0.0')
  assert.equal(notes.length, 6)
  for (const group of notes) assert.ok(group.items.length <= 8)
})

test('malformed payloads never throw and drop unusable entries', () => {
  assert.deepEqual(normalizeReleaseNotes(null, '1.0.0'), [])
  assert.deepEqual(normalizeReleaseNotes(undefined, '1.0.0'), [])
  assert.deepEqual(normalizeReleaseNotes(42, '1.0.0'), [])
  assert.deepEqual(normalizeReleaseNotes([null, { note: 'no version' }, { version: '9.9.9' }, 'junk'], '1.0.0').length, 0)
})

test('numeric html entities decode within safe bounds only', () => {
  const ok = normalizeReleaseNotes('a &#65; b &#x42; c &#9999999999; d &unknown;', '1.0.0')
  assert.deepEqual(ok[0].items, ['a A b B c &#9999999999; d &unknown;'])
})
