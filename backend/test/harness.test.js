'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');
const tls = require('node:tls');
const test = require('node:test');

test('default test bootstrap disables live API credentials', () => {
  const guard = globalThis.__CULTUREPATH_TEST_GUARD__;

  assert.ok(guard, 'test guard must be loaded before tests');
  assert.equal(guard.liveApiEnabled, false);
  assert.equal(process.env.NODE_ENV, 'test');
  assert.equal(process.env.USE_MOCK_RAG, 'true');
  assert.equal(process.env.RUN_LIVE_API_SMOKE, '0');

  for (const name of guard.blockedEnvironmentVariables) {
    assert.equal(process.env[name], '', `${name} must be unavailable in default tests`);
  }
});

test('default tests reject network requests', async () => {
  const { networkBlockedMessage } = globalThis.__CULTUREPATH_TEST_GUARD__;

  await assert.rejects(
    fetch('https://example.com'),
    new RegExp(networkBlockedMessage),
  );

  for (const request of [
    () => http.get('http://example.com'),
    () => https.get('https://example.com'),
    () => net.connect(3306, '127.0.0.1'),
    () => new net.Socket().connect(3306, '127.0.0.1'),
    () => tls.connect(443, 'example.com'),
  ]) {
    assert.throws(request, new RegExp(networkBlockedMessage));
  }
});
