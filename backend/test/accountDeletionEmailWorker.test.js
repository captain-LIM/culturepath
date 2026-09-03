'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  claimDeliveryJobs,
  deliverJob,
  retryDelayMs,
  runAccountDeletionWorkerTick,
  safeErrorCode,
  startAccountDeletionEmailWorker,
} = require('../src/services/accountDeletionEmailWorker');
const { deriveToken } = require('../src/services/accountDeletionRequestService');

const config = Object.freeze({
  tokenSecret: 'test-only-account-deletion-secret-32-bytes',
  tokenTtlSeconds: 1800,
  workerLeaseSeconds: 60,
  workerBatchSize: 10,
  workerPollMs: 5000,
  cleanupIntervalMs: 300000,
  emailMaxAttempts: 3,
});

function claimPool(rows) {
  const state = { queries: [], begun: 0, committed: 0, released: 0 };
  const connection = {
    async beginTransaction() { state.begun += 1; },
    async query(sql, params) {
      state.queries.push({ sql, params });
      if (sql.startsWith('SELECT requests.id')) return [rows];
      if (sql.startsWith('UPDATE account_deletion_requests')) return [{ affectedRows: rows.length }];
      throw new Error(`Unexpected query: ${sql}`);
    },
    async commit() { state.committed += 1; },
    async rollback() {},
    release() { state.released += 1; },
  };
  return { state, getConnection: async () => connection };
}

test('claims due and stale jobs with a lease using SKIP LOCKED', async () => {
  const nonce = Buffer.alloc(32, 4);
  const database = claimPool([{
    id: 11,
    user_id: 7,
    token_nonce: nonce,
    locale: 'ko',
    delivery_attempts: 0,
    email: 'user@example.com',
  }]);
  const jobs = await claimDeliveryJobs({
    pool: database,
    config,
    clock: () => Date.UTC(2026, 8, 2),
    randomUuid: () => '00000000-0000-4000-8000-000000000001',
  });
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].claimId, '00000000-0000-4000-8000-000000000001');
  assert.match(database.state.queries[0].sql, /FOR UPDATE SKIP LOCKED/);
  assert.match(database.state.queries[0].sql, /delivery_claimed_at <=/);
  assert.match(database.state.queries[1].sql, /delivery_status = 'processing'/);
  assert.equal(database.state.committed, 1);
  assert.equal(database.state.released, 1);
});

test('delivers a derived token and removes the nonce after success', async () => {
  const nonce = Buffer.alloc(32, 5);
  const job = {
    id: 12, user_id: 7, token_nonce: nonce, locale: 'en',
    delivery_attempts: 0, email: 'user@example.com', claimId: 'claim-1',
  };
  const sent = [];
  const updates = [];
  const result = await deliverJob(job, {
    pool: { query: async (sql, params) => { updates.push({ sql, params }); return [{ affectedRows: 1 }]; } },
    config,
    clock: () => Date.UTC(2026, 8, 2),
    mailer: { sendDeletionConfirmation: async message => sent.push(message) },
    logger: { error() {} },
  });
  assert.deepEqual(result, { delivered: true });
  assert.equal(sent[0].token, deriveToken({ secret: config.tokenSecret, userId: 7, nonce }));
  assert.equal(sent[0].to, 'user@example.com');
  assert.match(updates[0].sql, /delivery_status = 'sent'/);
  assert.match(updates[0].sql, /token_nonce = NULL/);
  assert.equal(updates[0].params.includes(sent[0].token), false);
  assert.equal(updates[0].params.includes(sent[0].to), false);
});

test('retries delivery with bounded backoff and sanitized secret-free logging', async () => {
  const logs = [];
  const updates = [];
  const job = {
    id: 13, user_id: 8, token_nonce: Buffer.alloc(32, 6), locale: 'ja',
    delivery_attempts: 0, email: 'private@example.com', claimId: 'claim-2',
  };
  const result = await deliverJob(job, {
    pool: { query: async (sql, params) => { updates.push({ sql, params }); return [{ affectedRows: 1 }]; } },
    config,
    clock: () => 1_000_000,
    mailer: { sendDeletionConfirmation: async () => { throw Object.assign(new Error('contains private@example.com'), { code: 'E AUTH private@example.com' }); } },
    logger: { error: (...values) => logs.push(values) },
  });
  assert.equal(result.delivered, false);
  assert.equal(result.attempts, 1);
  assert.equal(result.nextAttemptAt.getTime(), 1_000_000 + retryDelayMs(1));
  assert.equal(updates[0].params[0], 'pending');
  assert.doesNotMatch(JSON.stringify(logs), /private@example\.com/);
  assert.equal(safeErrorCode({ code: 'bad value/with spaces' }), 'ACCOUNT_DELETION_OPERATION_FAILED');
  assert.equal(retryDelayMs(3), 900_000);
});

test('starts every claimed delivery in the batch before the lease can age sequentially', async () => {
  const rows = [21, 22].map(id => ({
    id, user_id: id, token_nonce: Buffer.alloc(32, id), locale: 'en',
    delivery_attempts: 0, email: `user${id}@example.com`,
  }));
  const database = claimPool(rows);
  database.query = async () => [{ affectedRows: 1 }];
  let release;
  const blocked = new Promise(resolve => { release = resolve; });
  let started = 0;
  const tick = runAccountDeletionWorkerTick({
    pool: database,
    config,
    randomUuid: () => '00000000-0000-4000-8000-000000000002',
    mailer: { sendDeletionConfirmation: async () => { started += 1; await blocked; } },
    logger: { error() {} },
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(started, 2);
  release();
  const result = await tick;
  assert.equal(result.claimedCount, 2);
  assert.equal(result.results.every(item => item.delivered), true);
});

test('malformed queued nonce becomes a bounded delivery failure', async () => {
  const updates = [];
  const result = await deliverJob({
    id: 15, user_id: 8, token_nonce: Buffer.alloc(4), locale: 'en',
    delivery_attempts: 2, email: 'user@example.com', claimId: 'claim-4',
  }, {
    pool: { query: async (sql, params) => { updates.push({ sql, params }); return [{ affectedRows: 1 }]; } },
    config,
    mailer: { sendDeletionConfirmation: async () => { throw new Error('must not send'); } },
    logger: { error() {} },
  });
  assert.equal(result.terminal, true);
  assert.equal(result.errorCode, 'TypeError');
  assert.equal(updates[0].params[0], 'failed');
});

test('marks the final failed delivery terminal and clears its nonce', async () => {
  const updates = [];
  const result = await deliverJob({
    id: 14, user_id: 8, token_nonce: Buffer.alloc(32, 6), locale: 'zh',
    delivery_attempts: 2, email: 'user@example.com', claimId: 'claim-3',
  }, {
    pool: { query: async (sql, params) => { updates.push({ sql, params }); return [{ affectedRows: 1 }]; } },
    config,
    mailer: { sendDeletionConfirmation: async () => { throw Object.assign(new Error('fail'), { code: 'ECONNECTION' }); } },
    logger: { error() {} },
  });
  assert.equal(result.terminal, true);
  assert.equal(updates[0].params[0], 'failed');
  assert.equal(updates[0].params[2], null);
  assert.match(updates[0].sql, /token_nonce = IF/);
});

test('worker starts immediately, avoids overlapping ticks, and can stop cleanly', async () => {
  let releaseClaim;
  const claimBlocked = new Promise(resolve => { releaseClaim = resolve; });
  let claimCalls = 0;
  let intervalCallback;
  let cleared = false;
  const worker = startAccountDeletionEmailWorker({
    config,
    pool: {
      async getConnection() {
        claimCalls += 1;
        await claimBlocked;
        return claimPool([]).getConnection();
      },
    },
    mailer: { async sendDeletionConfirmation() {} },
    logger: { error() {} },
    setIntervalFn(callback) { intervalCallback = callback; return { unref() {} }; },
    clearIntervalFn() { cleared = true; },
  });
  intervalCallback();
  assert.equal(claimCalls, 1);
  releaseClaim();
  await worker.stop();
  assert.equal(cleared, true);
});
