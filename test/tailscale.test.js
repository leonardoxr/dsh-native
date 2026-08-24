'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  findPeerForHost,
  isTailscaleIpv4,
  isValidDnsName,
  magicDnsHttpsUrl,
  parseTailscaleStatus,
  readTailscaleStatus,
  stderrDiagnostic,
  tailscaleCommand,
} = require('../src/lib/tailscale')

const STATUS_FIXTURE = JSON.stringify({
  Self: { DNSName: 'me.tail1234.ts.net.', TailscaleIPs: ['100.101.1.5', '192.168.1.5'] },
  MagicDNSSuffix: 'tail1234.ts.net',
  Peer: {
    key1: { DNSName: 'box.tail1234.ts.net.', HostName: 'box', TailscaleIPs: ['100.90.0.1'], Online: true },
    key2: { DNSName: 'asleep.tail1234.ts.net.', HostName: 'asleep', TailscaleIPs: [], Online: false },
    key3: { HostName: 'nodns', TailscaleIPs: ['100.90.0.9'] },
    key4: { HostName: 'ignored' },
  },
})

test('parses self and peer projections from tailscale status JSON', () => {
  const status = parseTailscaleStatus(STATUS_FIXTURE);
  assert.ok(status.available);
  assert.equal(status.magicDnsName, 'me.tail1234.ts.net');
  assert.deepEqual(status.selfAddresses, ['100.101.1.5']);
  assert.equal(status.peers.length, 3);
  const box = status.peers.find((peer) => peer.hostName === 'box');
  assert.equal(box.dnsName, 'box.tail1234.ts.net');
  assert.equal(box.ip, '100.90.0.1');
  assert.equal(box.online, true);
  const asleep = status.peers.find((peer) => peer.hostName === 'asleep');
  assert.equal(asleep.online, false);
  const nodns = status.peers.find((peer) => peer.hostName === 'nodns');
  assert.equal(nodns.dnsName, null);
});

test('garbage payloads parse to null instead of throwing', () => {
  assert.equal(parseTailscaleStatus('not json'), null)
  assert.equal(parseTailscaleStatus('[1,2]'), null)
  assert.equal(parseTailscaleStatus('{}').available, false)
})

test('recognizes only IPv4 literals in the CGNAT range', () => {
  for (const good of ['100.64.0.0', '100.127.255.254', '100.101.1.5']) {
    assert.equal(isTailscaleIpv4(good), true, good);
  }
  for (const bad of ['100.63.0.1', '100.128.0.1', '10.0.0.1', '999.1.1.1', '100.64.0.256', '100.64', '', null]) {
    assert.equal(isTailscaleIpv4(bad), false, String(bad));
  }
})

test('classifies CLI stderr into labels without leaking raw text', () => {
  assert.equal(stderrDiagnostic('not logged in'), 'not-logged-in')
  assert.equal(stderrDiagnostic('handler does not exist for port'), 'no-existing-handler')
  assert.equal(stderrDiagnostic('operation not permitted'), 'permission-denied')
  const secret = 'failed: tskey-auth-k1234567890abcdef secret material';
  const label = stderrDiagnostic(secret);
  assert.equal(label, 'unknown');
  assert.ok(!label.includes('tskey'));
  assert.ok(label.length < 32);
  assert.equal(stderrDiagnostic(''), null);
})

test('platform command selection', () => {
  assert.equal(tailscaleCommand('win32'), 'tailscale.exe')
  assert.equal(tailscaleCommand('linux'), 'tailscale')
})

function fakeChild(mode, payload) {
  const exitHandlers = [];
  const errorHandlers = [];
  const stdoutHandlers = [];
  const stderrHandlers = [];
  let killed = false;
  const child = {
    stdout: { on: (ev, cb) => { if (ev === 'data') stdoutHandlers.push(cb); } },
    stderr: { on: (ev, cb) => { if (ev === 'data') stderrHandlers.push(cb); } },
    once: (ev, cb) => {
      if (ev === 'exit') exitHandlers.push(cb);
      if (ev === 'error') errorHandlers.push(cb);
    },
    kill() { killed = true; },
    __killed: () => killed,
    __run() {
      if (mode === 'ok') {
        stdoutHandlers.forEach((cb) => cb(Buffer.from(payload)));
        exitHandlers.forEach((cb) => cb(0));
      } else if (mode === 'auth') {
        stderrHandlers.forEach((cb) => cb(Buffer.from('Logged out.')));
        exitHandlers.forEach((cb) => cb(1));
      } else if (mode === 'garbage') {
        stdoutHandlers.forEach((cb) => cb(Buffer.from('definitely not json')));
        exitHandlers.forEach((cb) => cb(0));
      }
      // mode 'hang' never exits.
    },
    __fail() { errorHandlers.forEach((cb) => cb(new Error('ENOENT'))); },
  };
  return child;
}

test('readTailscaleStatus resolves parsed data from a healthy CLI run', async () => {
  const child = fakeChild('ok', STATUS_FIXTURE);
  queueMicrotask(() => child.__run());
  const result = await readTailscaleStatus({ timeoutMs: 500, spawnImpl: () => child });
  assert.equal(result.diagnostic, null);
  assert.equal(result.status.magicDnsName, 'me.tail1234.ts.net');
});

test('readTailscaleStatus reports safe diagnostics for failures', async () => {
  const authChild = fakeChild('auth');
  queueMicrotask(() => authChild.__run());
  const authed = await readTailscaleStatus({ timeoutMs: 500, spawnImpl: () => authChild });
  assert.equal(authed.status, null);
  assert.equal(authed.diagnostic, 'not-logged-in');
  const garbageChild = fakeChild('garbage');
  queueMicrotask(() => garbageChild.__run());
  const garbage = await readTailscaleStatus({ timeoutMs: 500, spawnImpl: () => garbageChild });
  assert.equal(garbage.diagnostic, 'unparsable');
  const missing = await readTailscaleStatus({ timeoutMs: 500, spawnImpl: () => { throw new Error('ENOENT'); } });
  assert.equal(missing.diagnostic, 'not-installed');
});

test('readTailscaleStatus kills hung CLI runs at the timeout', async () => {
  const child = fakeChild('hang');
  const result = await readTailscaleStatus({ timeoutMs: 20, spawnImpl: () => child });
  assert.equal(result.status, null);
  assert.equal(result.diagnostic, 'timeout');
  assert.equal(child.__killed(), true);
});

test('magicDNS names become canonical https URLs and nothing else passes', () => {
  assert.equal(magicDnsHttpsUrl('Box.Tail1234.ts.NET.'), 'https://box.tail1234.ts.net/')
  assert.equal(magicDnsHttpsUrl('host.tailnet.ts.net'), 'https://host.tailnet.ts.net/')
  assert.equal(magicDnsHttpsUrl('evil.com/path'), null)
  assert.equal(magicDnsHttpsUrl('has spaces.ts.net'), null)
  assert.equal(magicDnsHttpsUrl('-leading.tailnet.ts.net'), null)
  assert.equal(magicDnsHttpsUrl(''), null)
  assert.equal(isValidDnsName('a'.repeat(254)), false);
  assert.equal(isValidDnsName(('ab.'.repeat(80) + 'com').slice(0, 253)), true);
})

test('peers match saved servers by MagicDNS name or IP literal', () => {
  const peers = [
    { dnsName: 'Box.Tail.ts.net', hostName: 'box', ip: '100.90.0.1', online: true },
    { dnsName: null, hostName: 'iponly', ip: '100.90.0.9', online: false },
  ];
  assert.equal(findPeerForHost(peers, 'https://box.tail.ts.net/').online, true);
  assert.equal(findPeerForHost(peers, 'http://100.90.0.9:3080/').hostName, 'iponly');
  assert.equal(findPeerForHost(peers, 'https://stranger.example/'), null);
  assert.equal(findPeerForHost(peers, 'not a url'), null);
})