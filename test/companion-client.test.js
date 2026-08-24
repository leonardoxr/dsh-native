'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  buildCompanionUrl,
  CompanionFetchError,
  fetchCompanionServerData,
  probeCandidates,
  validateWorkspacesPayload,
} = require('../src/lib/companion-client')

function jsonResponse(body, init = {}) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status: init.status ?? 200,
    headers: init.headers ?? { 'content-type': 'application/json' },
  })
}

function fakeFetch(routes) {
  const calls = [];
  const impl = async (url) => {
    calls.push(url);
    const route = routes.get(new URL(url).pathname);
    if (route === undefined) throw new Error('unexpected url ' + url);
    if (typeof route === 'number') return jsonResponse({}, { status: route });
    return jsonResponse(route);
  };
  impl.calls = calls;
  return impl;
}

const WS_PATH = '/api/companion/workspaces';
const SS_PATH = '/api/companion/sessions';
const WORKSPACES = { workspaces: [
  { id: 'w1', title: 'Alpha', path: '/repo/alpha', createdAt: '2024-05-01T00:00:00Z', updatedAt: '2024-06-02T03:04:05Z', sessionIds: ['s1', 's2'] },
  { id: 'bad', path: '/missing-title' },
] };
const SESSIONS = { sessions: [
  { id: 's1', title: 'One', cwd: '/repo/alpha', createdAt: 1717200000000, updatedAt: 1717400000000 },
  { id: 's9', title: null, cwd: null, createdAt: 1717300000000 },
] };

test('builds absolute Companion URLs and keeps the local-origin exception', () => {
  assert.equal(buildCompanionUrl('https://example.com/'), 'https://example.com/api/companion/workspaces')
  assert.equal(buildCompanionUrl('https://example.com/base/', '/api/companion/sessions'), 'https://example.com/api/companion/sessions')
  assert.equal(buildCompanionUrl('http://127.0.0.1:3080/'), 'http://127.0.0.1:3080/api/companion/workspaces')
  assert.equal(buildCompanionUrl('http://localhost:3080/'), null)
  assert.equal(buildCompanionUrl('http://127.0.0.1:8080/'), null)
  assert.equal(buildCompanionUrl('ftp://example.com/'), null)
  assert.equal(buildCompanionUrl('not a url'), null)
});

test('payload validation drops malformed rows but keeps good ones', () => {
  const rows = validateWorkspacesPayload(WORKSPACES);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'w1');
  assert.equal(validateWorkspacesPayload({ nope: [] }), null);
  assert.equal(validateWorkspacesPayload(null), null);
});

test('fetches both endpoints with short timeouts and returns validated data', async () => {
  const fetchImpl = fakeFetch(new Map([[WS_PATH, WORKSPACES], [SS_PATH, SESSIONS]]));
  const result = await fetchCompanionServerData('https://example.com', { fetchImpl, timeoutMs: 250 });
  assert.deepEqual(fetchImpl.calls.sort(), ['/api/companion/sessions', '/api/companion/workspaces'].map((p) => 'https://example.com' + p));
  assert.equal(result.ok, true);
  assert.equal(result.failure, null);
  assert.equal(result.workspaces.length, 1);
  assert.equal(result.sessions.length, 2);
  assert.equal(result.sessions.find((session) => session.id === 's1').updatedAt, 1717400000000);
  assert.equal(result.sessions.find((session) => session.id === 's9').updatedAt, 1717300000000);
});

test('a failed sessions read degrades enrichment without failing the server', async () => {
  const fetchImpl = fakeFetch(new Map([[WS_PATH, WORKSPACES], [SS_PATH, 500]]));
  const result = await fetchCompanionServerData('https://example.com', { fetchImpl, timeoutMs: 250 });
  assert.equal(result.ok, true);
  assert.equal(result.sessions, null);
  assert.equal(result.failure.reason, 'http-status');
});

test('maps HTTP statuses to named failures', async () => {
  const denied = await fetchCompanionServerData('https://example.com', {
    fetchImpl: fakeFetch(new Map([[WS_PATH, 403], [SS_PATH, 403]])),
    timeoutMs: 250,
  });
  assert.equal(denied.ok, false);
  assert.equal(denied.failure.reason, 'unauthorized');
  assert.equal(denied.failure.httpStatus, 403);
  const missing = await fetchCompanionServerData('https://example.com', {
    fetchImpl: fakeFetch(new Map([[WS_PATH, 404], [SS_PATH, 404]])),
    timeoutMs: 250,
  });
  assert.equal(missing.failure.reason, 'not-found');
});

test('aborts slow servers as timeouts within the budget', async () => {
  let observedSignal = null;
  const impl = (url, { signal } = {}) => {
    observedSignal = signal;
    return new Promise((resolve, reject) => {
      signal?.addEventListener('abort', () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      });
    });
  };
  const result = await fetchCompanionServerData('https://example.com', { fetchImpl: impl, timeoutMs: 20 });
  assert.equal(result.ok, false);
  assert.equal(result.failure.reason, 'timeout');
  assert.ok(observedSignal?.aborted);
});

test('refuses cross-origin redirects instead of following them', async () => {
  const impl = async () => ({
    ok: true,
    status: 200,
    redirected: true,
    url: 'https://elsewhere.example/finish',
    headers: { get: () => 'application/json' },
    json: async () => ({ workspaces: [] }),
  });
  const result = await fetchCompanionServerData('https://example.com', { fetchImpl: impl, timeoutMs: 250 });
  assert.equal(result.ok, false);
  assert.equal(result.failure.reason, 'redirect');
});

test('probeCandidates classifies tailnet peers', async () => {
  const byHost = async (url) => {
    if (url.startsWith('https://ready.')) return jsonResponse({ workspaces: [] });
    if (url.startsWith('https://locked.')) return jsonResponse({ error: 'untrusted request authority' }, { status: 403 });
    throw Object.assign(new Error('connect refused'), { cause: { code: 'ECONNREFUSED' } });
  };
  const results = await probeCandidates(
    ['https://ready.ts.net/', 'https://locked.ts.net/', 'https://down.ts.net/'],
    { fetchImpl: byHost, timeoutMs: 200 },
  );
  assert.deepEqual(results, ['ready', 'unauthorized', 'unreachable']);
});

test('CompanionFetchError carries reason and status', () => {
  const err = new CompanionFetchError('unauthorized', 'no', { httpStatus: 403 });
  assert.equal(err.reason, 'unauthorized');
  assert.equal(err.httpStatus, 403);
  assert.ok(err instanceof Error);
});