'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  createToken,
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
});

test('creates an opaque 256-bit token and stores only its SHA-256 hash', async () => {
  const sent = [];
  const fixedBytes = Buffer.alloc(32, 7);
  const expectedToken = createToken(() => fixedBytes);
  assert.equal(expectedToken.length, 43);
  assert.equal(normalizeLocale('EN'), 'en');
  assert.equal(normalizeLocale('unsupported'), 'ko');
  const db = databaseStub(async sql => {
    if (sql.startsWith('DELETE FROM account_deletion_requests')) return [{ affectedRows: 0 }];
    if (sql.startsWith('SELECT id, email')) return [[{ id: 4, email: 'User@Example.com' }]];
    if (sql.startsWith('SELECT token_hash')) return [[]];
    if (sql.startsWith('INSERT INTO account_deletion_requests')) return [{ affectedRows: 1 }];
    throw new Error(`Unexpected query: ${sql}`);
  });

  const result = await requestAccountDeletion(' USER@example.com ', 'en', {
    pool: db.pool,
    config,
    randomBytes: () => fixedBytes,
    clock: () => Date.UTC(2026, 8, 2),
    mailer: { sendDeletionConfirmation: async data => sent.push(data) },
  });

  assert.equal(result.accepted, true);
  assert.equal(result.emailScheduled, true);
  assert.equal(sent[0].token, expectedToken);
  assert.equal(sent[0].to, 'User@Example.com');
  const insert = db.state.queries.find(item => item.sql.startsWith('INSERT'));
  assert.equal(insert.params[1], hashToken(expectedToken));
  assert.equal(insert.params.includes(expectedToken), false);
  assert.equal(db.state.committed, 1);
  assert.equal(db.state.released, 1);
});

test('returns the same accepted result without sending for an unknown email', async () => {
  let mailed = false;
  const db = databaseStub(async sql => {
    if (sql.startsWith('DELETE FROM account_deletion_requests')) return [{ affectedRows: 0 }];
    if (sql.startsWith('SELECT id, email')) return [[]];
    throw new Error(`Unexpected query: ${sql}`);
  });
  const result = await requestAccountDeletion('missing@example.com', 'ko', {
    pool: db.pool, config, clock: () => 1_000_000,
    mailer: { sendDeletionConfirmation: async () => { mailed = true; } },
  });
  assert.deepEqual(result, { accepted: true, emailScheduled: false });
  assert.equal(mailed, false);
  assert.equal(db.state.rolledBack, 1);
});

test('suppresses mail during cooldown and after the daily limit', async t => {
  for (const [name, previous] of [
    ['cooldown', { last_sent_at: new Date(900_000), send_window_started_at: new Date(0), send_count: 1 }],
    ['daily limit', { last_sent_at: new Date(0), send_window_started_at: new Date(0), send_count: 3 }],
  ]) {
    await t.test(name, async () => {
      let mailed = false;
      const db = databaseStub(async sql => {
        if (sql.startsWith('DELETE FROM account_deletion_requests')) return [{ affectedRows: 0 }];
        if (sql.startsWith('SELECT id, email')) return [[{ id: 4, email: 'user@example.com' }]];
        if (sql.startsWith('SELECT token_hash')) return [[previous]];
        throw new Error(`Unexpected query: ${sql}`);
      });
      const result = await requestAccountDeletion('user@example.com', 'ko', {
        pool: db.pool, config, clock: () => 1_000_000,
        mailer: { sendDeletionConfirmation: async () => { mailed = true; } },
      });
      assert.deepEqual(result, { accepted: true, emailScheduled: false });
      assert.equal(mailed, false);
    });
  }
});

test('removes the newly issued request when SMTP delivery fails', async () => {
  const db = databaseStub(async sql => {
    if (sql.startsWith('DELETE FROM account_deletion_requests')) return [{ affectedRows: 1 }];
    if (sql.startsWith('SELECT id, email')) return [[{ id: 4, email: 'user@example.com' }]];
    if (sql.startsWith('SELECT token_hash')) return [[]];
    if (sql.startsWith('INSERT INTO account_deletion_requests')) return [{ affectedRows: 1 }];
    throw new Error(`Unexpected query: ${sql}`);
  });
  const result = await requestAccountDeletion('user@example.com', 'ko', {
    pool: db.pool, config,
    mailer: { sendDeletionConfirmation: async () => { throw Object.assign(new Error('fail'), { code: 'ECONNECTION' }); } },
  });
  assert.equal(result.deliveryErrorCode, 'ECONNECTION');
  assert.equal(db.state.queries.filter(item => item.sql.startsWith('DELETE FROM account_deletion_requests')).length, 2);
});

test('valid confirmation locks the user and deletes all account data transactionally', async () => {
  const token = createToken();
  const removed = [];
  const db = databaseStub(async sql => {
    if (sql.startsWith('DELETE FROM account_deletion_requests')) return [{ affectedRows: 0 }];
    if (sql.includes('token_expires_at >')) return [[{ user_id: 9 }]];
    if (sql.startsWith('SELECT user_id FROM account_deletion_requests WHERE token_hash')) return [[{ user_id: 9 }]];
    if (sql.startsWith('SELECT id FROM users')) return [[{ id: 9 }]];
    if (sql.startsWith('UPDATE courses')) return [{ affectedRows: 1 }];
    if (sql.startsWith('DELETE FROM ai_content_reports')) return [{ affectedRows: 2 }];
    if (sql.startsWith('DELETE FROM users')) return [{ affectedRows: 1 }];
    throw new Error(`Unexpected query: ${sql}`);
  });
  const result = await confirmAccountDeletion(token, {
    pool: db.pool,
    clock: () => Date.UTC(2026, 8, 2),
    sessionStore: { removeAllForUser: userId => removed.push(userId) },
  });
  assert.deepEqual(result, { deleted: true });
  assert.equal(db.state.committed, 1);
  assert.deepEqual(removed, [9]);
  assert.ok(db.state.queries.some(item => item.sql.startsWith('DELETE FROM ai_content_reports')));
  assert.ok(db.state.queries.some(item => item.sql.startsWith('DELETE FROM users')));
});

test('invalid or expired token never mutates account data', async t => {
  for (const mode of ['missing', 'expired']) {
    await t.test(mode, async () => {
      const db = databaseStub(async sql => {
        if (sql.startsWith('DELETE FROM account_deletion_requests')) return [{ affectedRows: 0 }];
        if (sql.includes('token_expires_at >')) return [[]];
        if (sql.startsWith('SELECT user_id FROM account_deletion_requests WHERE token_hash')) {
          return mode === 'missing' ? [[]] : [[{ user_id: 9 }]];
        }
        if (sql.startsWith('SELECT id FROM users')) return [[{ id: 9 }]];
        throw new Error(`Unexpected mutation: ${sql}`);
      });
      const result = await confirmAccountDeletion(createToken(), { pool: db.pool });
      assert.deepEqual(result, { deleted: false });
      assert.equal(db.state.committed, 0);
      assert.equal(db.state.rolledBack, 1);
    });
  }
});

test('rolls back confirmation and keeps sessions when account deletion fails', async () => {
  let removed = false;
  const db = databaseStub(async sql => {
    if (sql.startsWith('DELETE FROM account_deletion_requests')) return [{ affectedRows: 0 }];
    if (sql.includes('token_expires_at >')) return [[{ user_id: 9 }]];
    if (sql.startsWith('SELECT user_id FROM account_deletion_requests WHERE token_hash')) return [[{ user_id: 9 }]];
    if (sql.startsWith('SELECT id FROM users')) return [[{ id: 9 }]];
    if (sql.startsWith('UPDATE courses')) throw new Error('database unavailable');
    throw new Error(`Unexpected query: ${sql}`);
  });
  await assert.rejects(confirmAccountDeletion(createToken(), {
    pool: db.pool,
    sessionStore: { removeAllForUser: () => { removed = true; } },
  }), /database unavailable/);
  assert.equal(db.state.rolledBack, 1);
  assert.equal(removed, false);
});

test('the same confirmation token can delete at most once', async () => {
  const token = createToken();
  let userExists = true;
  let requestExists = true;
  const db = databaseStub(async sql => {
    if (sql.startsWith('DELETE FROM account_deletion_requests')) return [{ affectedRows: 0 }];
    if (sql.includes('token_expires_at >')) return [requestExists ? [{ user_id: 9 }] : []];
    if (sql.startsWith('SELECT user_id FROM account_deletion_requests')) return [requestExists ? [{ user_id: 9 }] : []];
    if (sql.startsWith('SELECT id FROM users')) return [userExists ? [{ id: 9 }] : []];
    if (sql.startsWith('UPDATE courses')) return [{ affectedRows: 0 }];
    if (sql.startsWith('DELETE FROM ai_content_reports')) return [{ affectedRows: 0 }];
    if (sql.startsWith('DELETE FROM users')) {
      userExists = false;
      requestExists = false;
      return [{ affectedRows: 1 }];
    }
    throw new Error(`Unexpected query: ${sql}`);
  });
  const options = { pool: db.pool, sessionStore: { removeAllForUser() {} } };
  assert.deepEqual(await confirmAccountDeletion(token, options), { deleted: true });
  assert.deepEqual(await confirmAccountDeletion(token, options), { deleted: false });
});
