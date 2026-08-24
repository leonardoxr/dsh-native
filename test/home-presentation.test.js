'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { formatAge, presentBanner, presentFailure, presentServer } = require('../src/lib/home-presentation')

test('silence when healthy, progress while checking, summary when degraded', () => {
  assert.equal(presentBanner([{ status: 'online' }, { status: 'online' }]), null);
  const busy = presentBanner([{ status: 'loading' }, { status: 'online' }]);
  assert.equal(busy.tone, 'busy');
  assert.equal(busy.showsProgress, true);
  assert.match(busy.label, /Refreshing 1 server/);
  const allBusy = presentBanner([{ status: 'loading' }, { status: 'starting' }]);
  assert.match(allBusy.label, /Checking servers/);
  const warn = presentBanner([{ status: 'unavailable' }, { status: 'online' }, { status: 'online' }]);
  assert.equal(warn.tone, 'warn');
  assert.equal(warn.label, '1 of 3 servers unavailable');
  assert.equal(warn.showsProgress, false);
})

test('the unauthorized state names the exact remediation', () => {
  const view = presentFailure({ reason: 'unauthorized' }, 'https://box.tail1234.ts.net');
  assert.equal(view.label, 'Not authorized');
  assert.match(view.hint, /dsh web --trusted-host box\.tail1234\.ts\.net/);
})

test('failure wording covers the whole diagnostic ladder', () => {
  const cases = {
    'not-found': 'No Companion',
    'offline-peer': 'Offline (tailnet)',
    timeout: 'Unreachable',
    dns: 'Unreachable',
    refused: 'Unreachable',
    tls: 'Unreachable',
  };
  for (const [reason, label] of Object.entries(cases)) {
    assert.equal(presentFailure({ reason }).label, label, reason);
  }
  const local = presentFailure({ reason: 'local-start', message: 'port busy' });
  assert.match(local.label, /Cannot start local DSH Web/);
  assert.match(local.hint, /port busy/);
})

test('server presentations map statuses to tones and progress flags', () => {
  assert.deepEqual(presentServer({ status: 'online' }), { tone: 'ok', label: '', hint: '', showsProgress: false });
  const starting = presentServer({ status: 'starting' });
  assert.equal(starting.tone, 'busy');
  assert.equal(starting.showsProgress, true);
  const cached = presentServer({ status: 'cache', fetchedAt: Date.now() - 60000 });
  assert.equal(cached.tone, 'idle');
  assert.match(cached.label, /Last seen 1m ago/);
  const bad = presentServer({ status: 'unavailable', failure: { reason: 'refused' } });
  assert.equal(bad.tone, 'bad');
  assert.equal(bad.label, 'Unreachable');
})

test('relative ages stay coarse and safe', () => {
  const now = 1700000000000;
  assert.equal(formatAge(now - 2000, now), 'just now');
  assert.equal(formatAge(now - 59000, now), '59s ago');
  assert.equal(formatAge(now - 90000, now), '1m ago');
  assert.equal(formatAge(now - 7200000, now), '2h ago');
  assert.equal(formatAge(now - 172800000, now), '2d ago');
  assert.equal(formatAge(undefined, now), '');
  assert.equal(formatAge('junk', now), '');
})