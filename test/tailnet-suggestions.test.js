'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { createTailnetSuggestionTracker } = require('../src/lib/tailnet-suggestions')

const PEERS = [
  { dnsName: 'alpha.tailnet.ts.net', hostName: 'alpha', online: true },
  { dnsName: 'beta.tailnet.ts.net', hostName: 'beta', online: false },
  { dnsName: 'saved.tailnet.ts.net', hostName: 'saved', online: true },
  { dnsName: '', hostName: 'nameless', online: true },
]

/** Fake probe: resolves 'ready' for every URL and records each round. */
function fakeProbe(labelsByUrl) {
  const rounds = []
  const impl = async (urls) => {
    rounds.push(urls)
    return urls.map((url) => labelsByUrl.get(url) ?? 'ready')
  }
  impl.rounds = rounds
  return impl
}

function refresh(tracker, probe, overrides = {}) {
  return tracker.refresh({
    peers: PEERS,
    savedHostnames: ['saved.tailnet.ts.net'],
    probe,
    ...overrides,
  })
}

test('probes a peer set once and serves repeat refreshes from cache', async () => {
  const tracker = createTailnetSuggestionTracker()
  const probe = fakeProbe(new Map())
  const first = await refresh(tracker, probe)
  const second = await refresh(tracker, probe)
  assert.equal(probe.rounds.length, 1)
  assert.deepEqual(first, second)
  // Saved hosts and nameless peers never become candidates.
  assert.deepEqual(first.peers.map((peer) => peer.dnsName), [
    'alpha.tailnet.ts.net',
    'beta.tailnet.ts.net',
  ])
})

test('merges fresh online flags into cached probes without re-probing', async () => {
  const tracker = createTailnetSuggestionTracker()
  const probe = fakeProbe(new Map())
  await refresh(tracker, probe)
  const flipped = PEERS.map((peer) =>
    peer.dnsName === 'beta.tailnet.ts.net' ? { ...peer, online: true } : peer,
  )
  const result = await tracker.refresh({ peers: flipped, savedHostnames: ['saved.tailnet.ts.net'], probe })
  assert.equal(probe.rounds.length, 1)
  assert.deepEqual(result.peers.find((peer) => peer.dnsName === 'beta.tailnet.ts.net'), {
    dnsName: 'beta.tailnet.ts.net',
    hostName: 'beta',
    online: true,
    probe: 'ready',
  })
})

test('a changed candidate set triggers exactly one fresh probe round', async () => {
  const tracker = createTailnetSuggestionTracker()
  const probe = fakeProbe(new Map())
  await refresh(tracker, probe)
  const withNewPeer = [...PEERS, { dnsName: 'gamma.tailnet.ts.net', hostName: 'gamma', online: true }]
  const result = await tracker.refresh({ peers: withNewPeer, savedHostnames: ['saved.tailnet.ts.net'], probe })
  assert.equal(probe.rounds.length, 2)
  assert.deepEqual(probe.rounds[1], ['https://gamma.tailnet.ts.net/'])
  assert.ok(result.peers.some((peer) => peer.dnsName === 'gamma.tailnet.ts.net'))
})

test('expiring the TTL forces a re-probe even when nothing changed', async () => {
  let clock = 1_000
  const tracker = createTailnetSuggestionTracker({ ttlMs: 5 * 60 * 1000, now: () => clock })
  const probe = fakeProbe(new Map())
  await refresh(tracker, probe)
  clock += 5 * 60 * 1000 - 1
  await refresh(tracker, probe)
  assert.equal(probe.rounds.length, 1)
  clock += 1
  const result = await refresh(tracker, probe)
  assert.equal(probe.rounds.length, 2)
  assert.equal(result.available, true)
})

test('unreachable peers stay hidden until their cached label expires', async () => {
  let clock = 0
  const tracker = createTailnetSuggestionTracker({ now: () => clock })
  const labels = new Map([['https://beta.tailnet.ts.net/', 'unreachable']])
  const probe = fakeProbe(labels)
  const down = await refresh(tracker, probe)
  assert.deepEqual(down.peers.map((peer) => peer.dnsName), ['alpha.tailnet.ts.net'])

  // Still within the TTL the offline peer stays hidden without probing again.
  clock += 1000
  labels.set('https://beta.tailnet.ts.net/', 'ready')
  const stillDown = await refresh(tracker, probe)
  assert.equal(probe.rounds.length, 1)
  assert.equal(stillDown.peers.length, 1)

  // After the TTL the recovered peer is offered again.
  clock += 5 * 60 * 1000
  const recovered = await refresh(tracker, probe)
  assert.equal(probe.rounds.length, 2)
  assert.deepEqual(recovered.peers.map((peer) => peer.dnsName), [
    'alpha.tailnet.ts.net',
    'beta.tailnet.ts.net',
  ])
})

test('respects the suggestion limit and rejects a missing probe', async () => {
  const tracker = createTailnetSuggestionTracker({ suggestionLimit: 2 })
  const many = Array.from({ length: 5 }, (_, index) => ({
    dnsName: 'p' + index + '.tailnet.ts.net',
    hostName: 'p' + index,
    online: true,
  }))
  const probe = fakeProbe(new Map())
  const result = await tracker.refresh({ peers: many, savedHostnames: [], probe })
  assert.equal(result.peers.length, 2)
  assert.equal(probe.rounds[0].length, 2)
  await assert.rejects(
    tracker.refresh({ peers: many, savedHostnames: [] }),
    (error) => error instanceof TypeError,
  )
})
