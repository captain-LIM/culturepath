'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  DAY_MS,
  createNonce,
  createToken,
  deriveToken,
  hashToken,
  normalizeLocale,
  requestAccountDeletion,
  confirmAccountDeletion,
} = require('../src/services/accountDeletionRequestService');

function databaseStub(handler) {
  const state = { queries: [], begun: 0, committed: 0, rolledBack: 0, released: 0 };
  const connection = {
    async beginTransaction() { state.begun += 1; },
    async query(sql, params) { state.queries.push({ sql, params }); return handler(sql, params); },
    async commit() { state.committed += 1; },
    async rollback() { state.rolledBack += 1; },
    release() { state.released += 1; },
  };
  return { state, pool: { getConnection: async () => connection } };
}

const config = Object.freeze({
  tokenTtlSeconds: 1800,
  resendCooldownSeconds: 600,
  maxSendsPerDay: 3,
  tokenSecret: 'test-only-account-deletion-secret-32-bytes',
});

test('derives a stable 256-bit token from a secret, user, and 32-byte nonce', () => {
  const nonce = createNonce(() => Buffer.alloc(32, 7));
  const first = deriveToken({ secret: config.tokenSecret, userId: 4, nonce });
  const second = deriveToken({ secret: config.tokenSecret, userId: 4, nonce });
  assert.equal(nonce.length, 32);
  assert.equal(first.length, 43);
  assert.equal(first, second);
  assert.notEqual(first, deriveToken({ secret: config.tokenSecret, userId: 5, nonce }));
  assert.throws(() => deriveToken({ secret: 'short', userId: 4, nonce }), /32 bytes/);
  assert.throws(() => deriveToken({ secret: config.tokenSecret, userId: 4, nonce: Buffer.alloc(31) }), /32 bytes/);
  assert.equal(normalizeLocale('EN'), 'en');
  assert.equal(normalizeLocale('unsupported'), 'ko');
});

test('queues a delivery without storing raw token or email and without calling SMTP', async () => {
  const fixedNonce = Buffer.alloc(32, 9);
  const expectedToken = deriveToken({ secret: config.tokenSecret, userId: 4, nonce: fixedNonce });
  const db = databaseStub(async sql => {
    if (sql.startsWith('SELECT id FROM users')) return [[{ id: 4 }]];
    if (sql.startsWith('SELECT last_sent_at')) return [[]];
    if (sql.startsWith('INSERT INTO account_deletion_requests')) return [{ affectedRows: 1 }];
    throw new Error(`Unexpected query: ${sql}`);
  });
  let mailed = false;

  const result = await requestAccountDeletion(' USER@example.com ', 'en', {
    pool: db.pool,
    config,
    randomBytes: () => fixedNonce,
    clock: () => Date.UTC(2026, 8, 2),
    mailer: { sendDeletionConfirmation: async () => { mailed = true; } },
  });

  assert.deepEqual(result, { accepted: true, emailQueued: true });
  assert.equal(mailed, false);
  const userLookup = db.state.queries.find(item => item.sql.startsWith('SELECT id FROM users'));
  assert.deepEqual(userLookup.params, ['user@example.com']);
  const insert = db.state.queries.find(item => item.sql.startsWith('INSERT'));
  assert.equal(insert.params[1], hashToken(expectedToken));
  assert.deepEqual(insert.params[2], fixedNonce);
  assert.equal(insert.params.includes(expectedToken), false);
  assert.equal(insert.params.includes('USER@example.com'), false);
  assert.match(insert.sql, /delivery_status/);
  assert.equal(db.state.committed, 1);
});

test('returns generic acceptance without an outbox row for an unknown email', async () => {
  const db = databaseStub(async sql => {
    if (sql.startsWith('SELECT id FROM users')) return [[]];
    throw new Error(`Unexpected query: ${sql}`);
  });
  const result = await requestAccountDeletion('missing@example.com', 'ko', {
    pool: db.pool, config,
  });
  assert.deepEqual(result, { accepted: true, emailQueued: false });
  assert.equal(db.state.rolledBack, 1);
  assert.equal(db.state.queries.some(item => item.sql.startsWith('INSERT')), false);
});

test('does not replace the queued job during cooldown or after the daily limit', async t => {
  for (const [name, previous] of [
    ['cooldown', { last_sent_at: new Date(900_000), send_window_started_at: new Date(0), send_count: 1 }],
    ['daily limit', { last_sent_at: new Date(0), send_window_started_at: new Date(0), send_count: 3 }],
  ]) {
    await t.test(name, async () => {
      const db = databaseStub(async sql => {
        if (sql.startsWith('SELECT id FROM users')) return [[{ id: 4 }]];
        if (sql.startsWith('SELECT last_sent_at')) return [[previous]];
        throw new Error(`Unexpected query: ${sql}`);
      });
      const result = await requestAccountDeletion('user@example.com', 'ko', {
        pool: db.pool, config, clock: () => 1_000_000,
      });
      assert.deepEqual(result, { accepted: true, emailQueued: false });
      assert.equal(db.state.queries.some(item => item.sql.startsWith('INSERT')), false);
    });
  }
});

test('starts a fresh retention window when the old window cannot cover a full token lifetime', async () => {
  const now = Date.UTC(2026, 8, 2);
  const nearlyOneDayAgo = new Date(now - DAY_MS + config.tokenTtlSeconds * 1000 - 1);
  const db = databaseStub(async sql => {
    if (sql.startsWith('SELECT id FROM users')) return [[{ id: 4 }]];
    if (sql.startsWith('SELECT last_sent_at')) return [[{
      last_sent_at: new Date(now - config.resendCooldownSeconds * 1000 - 1),
      send_window_started_at: nearlyOneDayAgo,
      send_count: 2,
    }]];
    if (sql.startsWith('INSERT INTO account_deletion_requests')) return [{ affectedRows: 1 }];
    throw new Error(`Unexpected query: ${sql}`);
  });
  await requestAccountDeletion('user@example.com', 'ko', {
    pool: db.pool,
    config,
    randomBytes: () => Buffer.alloc(32, 8),
    clock: () => now,
  });
  const insert = db.state.queries.find(item => item.sql.startsWith('INSERT'));
  assert.equal(insert.params[6].getTime(), now);
  assert.equal(insert.params[7], 1);
});

function confirmationDatabase({ requestExists = true, valid = true, failMutation = false } = {}) {
  let userExists = requestExists;
  const db = databaseStub(async sql => {
    if (sql.includes('token_expires_at >')) return [valid && requestExists ? [{ user_id: 9 }] : []];
    if (sql.startsWith('SELECT user_id FROM account_deletion_requests')) return [requestExists ? [{ user_id: 9 }] : []];
    if (sql.startsWith('SELECT id FROM users')) return [userExists ? [{ id: 9 }] : []];
    if (sql.startsWith('UPDATE courses')) {
      if (failMutation) throw new Error('database unavailable');
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('DELETE FROM ai_content_reports')) return [{ affectedRows: 2 }];
    if (sql.startsWith('DELETE FROM users')) {
      userExists = false;
      requestExists = false;
      return [{ affectedRows: 1 }];
    }
    throw new Error(`Unexpected query: ${sql}`);
  });
  return db;
}

test('valid sent confirmation deletes all account data and only then removes sessions', async () => {
  const db = confirmationDatabase();
  const removed = [];
  const result = await confirmAccountDeletion(createToken(), {
    pool: db.pool,
    sessionStore: { removeAllForUser: userId => removed.push(userId) },
  });
  assert.deepEqual(result, { deleted: true });
  assert.equal(db.state.committed, 1);
  assert.deepEqual(removed, [9]);
  assert.match(db.state.queries[0].sql, /delivery_status = 'sent'/);
  assert.ok(db.state.queries.some(item => item.sql.startsWith('DELETE FROM ai_content_reports')));
});

test('missing, unsent, or expired tokens never mutate account data', async t => {
  for (const [name, settings] of [
    ['missing', { requestExists: false }],
    ['unsent', { requestExists: false }],
    ['expired', { valid: false }],
  ]) {
    await t.test(name, async () => {
      const db = confirmationDatabase(settings);
      const result = await confirmAccountDeletion(createToken(), { pool: db.pool });
      assert.deepEqual(result, { deleted: false });
      assert.equal(db.state.committed, 0);
      assert.equal(db.state.queries.some(item => item.sql.startsWith('UPDATE courses')), false);
    });
  }
});

test('rolls back deletion and keeps sessions when a mutation fails', async () => {
  const db = confirmationDatabase({ failMutation: true });
  let removed = false;
  await assert.rejects(confirmAccountDeletion(createToken(), {
    pool: db.pool,
    sessionStore: { removeAllForUser: () => { removed = true; } },
  }), /database unavailable/);
  assert.equal(db.state.rolledBack, 1);
  assert.equal(removed, false);
});

test('the same sent confirmation token can delete at most once', async () => {
  const db = confirmationDatabase();
  const token = createToken();
  const options = { pool: db.pool, sessionStore: { removeAllForUser() {} } };
  assert.deepEqual(await confirmAccountDeletion(token, options), { deleted: true });
  assert.deepEqual(await confirmAccountDeletion(token, options), { deleted: false });
});
