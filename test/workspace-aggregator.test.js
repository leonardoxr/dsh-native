'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { aggregateServers, toEpoch } = require('../src/lib/workspace-aggregator')

const HOST_A = { id: 'a', name: 'Alpha', url: 'https://alpha.example/' };
const HOST_B = { id: 'b', name: 'Beta', url: 'https://beta.example/', local: false };

function ws(id, title, path, updatedAt, sessionIds = [], createdAt = null) {
  return { id, title, path, updatedAt, sessionIds, ...(createdAt ? { createdAt } : {}) };
}
function sess(id, createdAt) { return { id, title: null, cwd: null, createdAt }; }
function ok(workspaces, sessions) { return { ok: true, workspaces, sessions, failure: null }; }

test('merges all servers into one most-recent-first stream', () => {
  const entries = [
    { host: HOST_B, result: ok([ws('b1', 'Older', '/old', '2024-03-01T00:00:00Z', ['s1'])], null) },
    {
      host: HOST_A,
      result: ok(
        [ws('a2', 'Newest', '/new', '2024-06-01T00:00:00Z', ['s1', 's2']), ws('a1', 'Middle', '/mid', '2024-04-01T00:00:00Z')],
        [sess('s1', 1717200000000), sess('s3', 1717300000000)],
      ),
    },
  ];
  const { workspaceRows, orphanSessions } = aggregateServers(entries);
  assert.deepEqual(workspaceRows.map((row) => row.title), ['Newest', 'Middle', 'Older']);
  const newest = workspaceRows[0];
  assert.equal(newest.hostName, 'Alpha');
  assert.equal(newest.totalSessions, 2);
  assert.equal(newest.liveSessions, 1);
  const middle = workspaceRows[1];
  assert.equal(middle.liveSessions, 0);
  assert.equal(orphanSessions.length, 1);
  assert.equal(orphanSessions[0].id, 's3');
});

test('equal timestamps break ties deterministically by title, then server', () => {
  // Tie-breaks use plain codepoint comparison (never locale collation) so
  // ordering is identical on every machine and in every test run.
  const at = '2024-06-01T00:00:00Z';
  const { workspaceRows } = aggregateServers([
    { host: HOST_B, result: ok([ws('b1', 'Zebra', '/z', at)], []) },
    { host: HOST_A, result: ok([ws('a1', 'beta', '/b', at)], []) },
  ]);
  assert.deepEqual(workspaceRows.map((row) => row.title), ['Zebra', 'beta']);
})

test('one unavailable server contributes no rows and blocks nobody', () => {
  const { workspaceRows, orphanSessions } = aggregateServers([
    { host: HOST_A, result: ok([ws('a1', 'Live', '/live', '2024-06-01T00:00:00Z', ['s1'])], [sess('s1', 1)]) },
    { host: HOST_B, result: { ok: false, workspaces: null, sessions: null, fetchedAt: Date.now(), failure: { reason: 'timeout' } } },
  ]);
  assert.deepEqual(workspaceRows.map((row) => row.id), ['a1']);
  assert.deepEqual(workspaceRows.map((row) => row.hostId), ['a']);
  assert.deepEqual(orphanSessions, []);
})

test('missing sessions data keeps total counts and skips live enrichment', () => {
  const { workspaceRows } = aggregateServers([
    { host: HOST_A, result: ok([ws('a1', 'Any', '/any', 1000, ['x', 'y'])], null) },
  ]);
  assert.equal(workspaceRows[0].totalSessions, 2);
  assert.equal(workspaceRows[0].liveSessions, null);
})

test('unusable timestamps fall back to createdAt, then epoch zero', () => {
  const { workspaceRows } = aggregateServers([
    { host: HOST_A, result: ok([
      ws('no-time-at-all', 'Zero', '/', undefined),
      ws('created-only', 'Created', '/', 'garbage', [], 5000),
      ws('fine', 'Fine', '/', 9000),
    ], []) },
  ]);
  assert.deepEqual(workspaceRows.map((row) => row.title), ['Fine', 'Created', 'Zero']);
})

test('toEpoch accepts epochs and ISO strings only', () => {
  assert.equal(toEpoch(1717200000000), 1717200000000);
  assert.equal(toEpoch('2024-06-01T00:00:00Z'), Date.parse('2024-06-01T00:00:00Z'));
  assert.equal(toEpoch('nonsense'), null);
  assert.equal(toEpoch(-5), null);
})