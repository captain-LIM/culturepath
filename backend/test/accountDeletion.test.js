'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const jwt = require('jsonwebtoken');
const pool = require('../src/config/db');
const {
  DELETED_AUTHOR_LABEL,
  deleteAccount,
} = require('../src/services/accountDeletionService');
const { deleteMyAccount } = require('../src/controllers/usersController');
const authMiddleware = require('../src/middleware/auth');
const optionalAuth = require('../src/middleware/optionalAuth');

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    sent: false,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    send() { this.sent = true; return this; },
  };
}

function connectionStub(query) {
  const state = { begun: 0, committed: 0, rolledBack: 0, released: 0 };
  return {
    state,
    connection: {
      async beginTransaction() { state.begun += 1; },
      query,
      async commit() { state.committed += 1; },
      async rollback() { state.rolledBack += 1; },
      release() { state.released += 1; },
    },
  };
}

test('deletes an account transactionally and anonymizes surviving forks first', async () => {
  const queries = [];
  const { connection, state } = connectionStub(async (sql, params) => {
    queries.push({ sql, params });
    if (sql.startsWith('SELECT id FROM users')) return [[{ id: 12 }]];
    if (sql.startsWith('UPDATE courses')) return [{ affectedRows: 2 }];
    if (sql.startsWith('DELETE FROM users')) return [{ affectedRows: 1 }];
    throw new Error(`Unexpected query: ${sql}`);
  });
  const removedUsers = [];

  const result = await deleteAccount(12, {
    pool: { getConnection: async () => connection },
    sessionStore: { removeAllForUser: id => removedUsers.push(id) },
  });

  assert.deepEqual(result, { deleted: true });
  assert.equal(state.begun, 1);
  assert.equal(state.committed, 1);
  assert.equal(state.rolledBack, 0);
  assert.equal(state.released, 1);
  assert.deepEqual(queries[1].params, [DELETED_AUTHOR_LABEL, 12]);
  assert.match(queries[1].sql, /forked_from_course_id/);
  assert.deepEqual(queries[2].params, [12]);
  assert.deepEqual(removedUsers, [12]);
});

test('returns not found without deleting data or AI sessions', async () => {
  const { connection, state } = connectionStub(async (sql) => {
    assert.match(sql, /^SELECT id FROM users/);
    return [[]];
  });
  let removed = false;

  const result = await deleteAccount(404, {
    pool: { getConnection: async () => connection },
    sessionStore: { removeAllForUser: () => { removed = true; } },
  });

  assert.deepEqual(result, { deleted: false });
  assert.equal(state.committed, 0);
  assert.equal(state.rolledBack, 1);
  assert.equal(state.released, 1);
  assert.equal(removed, false);
});

test('rolls back the whole deletion when a database mutation fails', async () => {
  const { connection, state } = connectionStub(async (sql) => {
    if (sql.startsWith('SELECT id FROM users')) return [[{ id: 12 }]];
    throw Object.assign(new Error('database unavailable'), { code: 'ER_LOCK_WAIT_TIMEOUT' });
  });
  let removed = false;

  await assert.rejects(
    deleteAccount(12, {
      pool: { getConnection: async () => connection },
      sessionStore: { removeAllForUser: () => { removed = true; } },
    }),
    /database unavailable/,
  );

  assert.equal(state.committed, 0);
  assert.equal(state.rolledBack, 1);
  assert.equal(state.released, 1);
  assert.equal(removed, false);
});

test('rejects account deletion without the explicit confirmation value', async () => {
  const originalGetConnection = pool.getConnection;
  pool.getConnection = async () => { throw new Error('database must not be opened'); };
  try {
    const res = responseRecorder();
    await deleteMyAccount({ body: {}, user: { id: 12 } }, res);
    assert.equal(res.statusCode, 400);
    assert.match(res.body.message, /확인/);
  } finally {
    pool.getConnection = originalGetConnection;
  }
});

test('deletion controller returns 204 after a committed account deletion', async () => {
  const originalGetConnection = pool.getConnection;
  const { connection } = connectionStub(async (sql) => {
    if (sql.startsWith('SELECT id FROM users')) return [[{ id: 12 }]];
    if (sql.startsWith('UPDATE courses')) return [{ affectedRows: 0 }];
    if (sql.startsWith('DELETE FROM users')) return [{ affectedRows: 1 }];
    throw new Error(`Unexpected query: ${sql}`);
  });
  pool.getConnection = async () => connection;
  try {
    const res = responseRecorder();
    await deleteMyAccount({ body: { confirmation: 'DELETE' }, user: { id: 12 } }, res);
    assert.equal(res.statusCode, 204);
    assert.equal(res.sent, true);
  } finally {
    pool.getConnection = originalGetConnection;
  }
});

test('authenticated middleware rejects a valid JWT for a deleted user', async () => {
  const originalQuery = pool.query;
  pool.query = async () => [[]];
  try {
    const token = jwt.sign({ id: 12 }, process.env.JWT_SECRET, { expiresIn: '5m' });
    const res = responseRecorder();
    let calledNext = false;
    await authMiddleware(
      { headers: { authorization: `Bearer ${token}` } },
      res,
      () => { calledNext = true; },
    );
    assert.equal(res.statusCode, 401);
    assert.equal(calledNext, false);
  } finally {
    pool.query = originalQuery;
  }
});

test('optional authentication treats a deleted-user token as a guest', async () => {
  const originalQuery = pool.query;
  pool.query = async () => [[]];
  try {
    const token = jwt.sign({ id: 12 }, process.env.JWT_SECRET, { expiresIn: '5m' });
    const req = { headers: { authorization: `Bearer ${token}` } };
    let calledNext = false;
    await optionalAuth(req, {}, () => { calledNext = true; });
    assert.equal(req.user, undefined);
    assert.equal(calledNext, true);
  } finally {
    pool.query = originalQuery;
  }
});

test('publishes a branded account-deletion page with a working request pathway', () => {
  const pagePath = path.join(
    __dirname,
    '..',
    'public',
    'account-deletion',
    'index.html',
  );
  const html = fs.readFileSync(pagePath, 'utf8');
  const appSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8');

  assert.match(appSource, /app\.get\('\/account-deletion'/);
  assert.match(html, /따라가방 \(CulturePath\)/);
  assert.match(html, /CulturePath 팀/);
  assert.match(html, /mailto:culturepath\.support@gmail\.com/);
  assert.match(html, /7일 이내/);
  assert.match(html, /탈퇴한 사용자/);
});
