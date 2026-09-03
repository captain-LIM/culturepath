'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  cleanupExpiredAccountDeletionRequests,
  startAccountDeletionCleanupScheduler,
} = require('../src/services/accountDeletionCleanupService');
const { startAccountDeletionJobs } = require('../src/services/accountDeletionJobs');
const { main: cleanupMain } = require('../scripts/cleanupAccountDeletionRequests');

test('cleanup removes only rows whose 24-hour window has elapsed', async () => {
  const queries = [];
  const result = await cleanupExpiredAccountDeletionRequests({
    pool: { query: async (sql, params) => { queries.push({ sql, params }); return [{ affectedRows: 3 }]; } },
    clock: () => Date.UTC(2026, 8, 3),
  });
  assert.deepEqual(result, { deletedCount: 3 });
  assert.equal(queries[0].params[0].getTime(), Date.UTC(2026, 8, 2));
  assert.match(queries[0].sql, /send_window_started_at <=/);
});

test('cleanup CLI reports only the count and always closes its injected pool', async () => {
  let closed = false;
  const logs = [];
  const result = await cleanupMain({
    pool: {
      query: async () => [{ affectedRows: 2 }],
      end: async () => { closed = true; },
    },
    clock: () => Date.UTC(2026, 8, 3),
    logger: { log: value => logs.push(value), error: value => logs.push(value) },
  });
  assert.equal(result.deletedCount, 2);
  assert.equal(closed, true);
  assert.deepEqual(logs, ['Account deletion request cleanup removed 2 row(s).']);
});

test('cleanup scheduler starts immediately, avoids overlap, and waits during stop', async () => {
  let releaseQuery;
  const queryBlocked = new Promise(resolve => { releaseQuery = resolve; });
  let queryCalls = 0;
  let intervalCallback;
  let cleared = false;
  let unrefCalled = false;
  const scheduler = startAccountDeletionCleanupScheduler({
    pool: {
      async query() {
        queryCalls += 1;
        await queryBlocked;
        return [{ affectedRows: 0 }];
      },
    },
    intervalMs: 300000,
    logger: { error() {}, info() {} },
    setIntervalFn(callback) {
      intervalCallback = callback;
      return { unref() { unrefCalled = true; } };
    },
    clearIntervalFn() { cleared = true; },
  });

  intervalCallback();
  assert.equal(queryCalls, 1);
  let stopped = false;
  const stopping = scheduler.stop().then(() => { stopped = true; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(stopped, false);
  releaseQuery();
  await stopping;
  intervalCallback();
  assert.equal(queryCalls, 1);
  assert.equal(cleared, true);
  assert.equal(unrefCalled, true);
});

test('cleanup scheduler retries after a sanitized failure and logs only deletion count', async () => {
  const errors = [];
  const info = [];
  let intervalCallback;
  let attempts = 0;
  const scheduler = startAccountDeletionCleanupScheduler({
    pool: {
      async query() {
        attempts += 1;
        if (attempts === 1) {
          throw Object.assign(new Error('private@example.com token-value'), {
            code: 'private@example.com',
          });
        }
        return [{ affectedRows: 4 }];
      },
    },
    intervalMs: 300000,
    logger: {
      error: (...values) => errors.push(values),
      info: (...values) => info.push(values),
    },
    setIntervalFn(callback) { intervalCallback = callback; return { unref() {} }; },
    clearIntervalFn() {},
  });

  await new Promise(resolve => setImmediate(resolve));
  intervalCallback();
  await new Promise(resolve => setImmediate(resolve));
  await scheduler.stop();
  assert.equal(attempts, 2);
  assert.match(JSON.stringify(errors), /ACCOUNT_DELETION_OPERATION_FAILED/);
  assert.doesNotMatch(JSON.stringify(errors), /private@example\.com|token-value/);
  assert.deepEqual(info[0][1], { deletedCount: 4 });
});

test('cleanup always starts while SMTP jobs remain behind the feature flag', () => {
  for (const enabled of [false, true]) {
    let cleanupStarts = 0;
    let workerStarts = 0;
    let mailerCreates = 0;
    const jobs = startAccountDeletionJobs({
      config: { enabled, cleanupIntervalMs: 300000 },
      pool: {},
      startCleanup() { cleanupStarts += 1; return { stop() {} }; },
      startEmailWorker() { workerStarts += 1; return { stop() {} }; },
      createMailer() { mailerCreates += 1; return {}; },
    });
    assert.equal(cleanupStarts, 1);
    assert.equal(workerStarts, enabled ? 1 : 0);
    assert.equal(mailerCreates, enabled ? 1 : 0);
    assert.ok(jobs.cleanupScheduler);
    assert.equal(Boolean(jobs.emailWorker), enabled);
  }

  const appSource = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'app.js'),
    'utf8',
  );
  assert.match(appSource, /startAccountDeletionJobs/);
  assert.match(appSource, /createGracefulShutdown/);
  assert.match(appSource, /backgroundJobs: \[accountDeletionWorker, accountDeletionCleanupScheduler\]/);
});
