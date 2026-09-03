'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createGracefulShutdown } = require('../src/utils/gracefulShutdown');

test('shutdown drains HTTP and background jobs before ending the database pool', async () => {
  const events = [];
  let closeCallback;
  let releaseEmail;
  let releaseCleanup;
  const emailStopped = new Promise(resolve => { releaseEmail = resolve; });
  const cleanupStopped = new Promise(resolve => { releaseCleanup = resolve; });
  const processRef = {};
  const shutdown = createGracefulShutdown({
    server: {
      close(callback) { events.push('server.close'); closeCallback = callback; },
      closeIdleConnections() { events.push('server.closeIdleConnections'); },
    },
    backgroundJobs: [
      { async stop() { events.push('email.stop'); await emailStopped; } },
      { async stop() { events.push('cleanup.stop'); await cleanupStopped; } },
    ],
    pool: { async end() { events.push('pool.end'); } },
    logger: { error() {} },
    processRef,
  });

  const first = shutdown('SIGTERM');
  const second = shutdown('SIGINT');
  assert.equal(first, second);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(events, [
    'server.close',
    'server.closeIdleConnections',
    'email.stop',
    'cleanup.stop',
  ]);
  assert.equal(events.includes('pool.end'), false);

  closeCallback();
  releaseEmail();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(events.includes('pool.end'), false);
  releaseCleanup();
  await first;
  assert.equal(events.at(-1), 'pool.end');
  assert.equal(events.filter(event => event === 'pool.end').length, 1);
  assert.equal(processRef.exitCode, undefined);
});

test('shutdown attempts every resource and sanitizes failures before rejecting', async () => {
  const events = [];
  const logs = [];
  const processRef = {};
  const shutdown = createGracefulShutdown({
    server: {
      close(callback) {
        events.push('server.close');
        callback(Object.assign(new Error('private@example.com'), { code: 'ECONNECTION' }));
      },
      closeIdleConnections() { events.push('server.closeIdleConnections'); },
    },
    backgroundJobs: [
      { async stop() { events.push('first.stop'); throw new Error('token-value'); } },
      { async stop() { events.push('second.stop'); } },
    ],
    pool: { async end() { events.push('pool.end'); } },
    logger: { error: (...values) => logs.push(values) },
    processRef,
  });

  await assert.rejects(shutdown('SIGTERM'), /GRACEFUL_SHUTDOWN_FAILED/);
  assert.deepEqual(events, [
    'server.close',
    'server.closeIdleConnections',
    'first.stop',
    'second.stop',
    'pool.end',
  ]);
  assert.equal(processRef.exitCode, 1);
  assert.match(JSON.stringify(logs), /ECONNECTION/);
  assert.match(JSON.stringify(logs), /ACCOUNT_DELETION_OPERATION_FAILED/);
  assert.doesNotMatch(JSON.stringify(logs), /private@example\.com|token-value/);
});

test('pool shutdown failure is reported without logging its sensitive message', async () => {
  const logs = [];
  const processRef = {};
  const shutdown = createGracefulShutdown({
    server: { close(callback) { callback(); } },
    backgroundJobs: [],
    pool: {
      async end() {
        throw Object.assign(new Error('secret-value'), { code: 'ER_LOCK_WAIT_TIMEOUT' });
      },
    },
    logger: { error: (...values) => logs.push(values) },
    processRef,
  });

  await assert.rejects(shutdown('SIGTERM'), /GRACEFUL_SHUTDOWN_FAILED/);
  assert.equal(processRef.exitCode, 1);
  assert.match(JSON.stringify(logs), /ER_LOCK_WAIT_TIMEOUT/);
  assert.doesNotMatch(JSON.stringify(logs), /secret-value/);
});
