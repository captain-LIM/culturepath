'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const pool = require('../src/config/db');
const {
  createCourse,
  forkCourse,
} = require('../src/controllers/coursesController');

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

async function withPoolStubs({ getConnection, query }, callback) {
  const originalGetConnection = pool.getConnection;
  const originalQuery = pool.query;
  pool.getConnection = getConnection;
  pool.query = query || originalQuery;
  try {
    await callback();
  } finally {
    pool.getConnection = originalGetConnection;
    pool.query = originalQuery;
  }
}

function request(key) {
  return {
    user: { id: 12 },
    body: { title: '멱등 코스', description: '', tracks: [], isPublic: false },
    get(name) { return name === 'Idempotency-Key' ? key : null; },
  };
}

function forkFingerprint(originalId) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify({ operation: 'fork', payload: { originalId } }))
    .digest('hex');
}

test('rejects malformed idempotency keys before opening a transaction', async () => {
  await withPoolStubs({
    getConnection: async () => { throw new Error('must not connect'); },
  }, async () => {
    const res = responseRecorder();
    await createCourse(request('short'), res);
    assert.equal(res.statusCode, 400);
  });
});

test('replays an existing course after an idempotency unique-key conflict', async () => {
  let call = 0;
  let fingerprint;
  const connection = {
    async beginTransaction() {},
    async rollback() {},
    release() {},
    async query(sql, params) {
      call += 1;
      if (call === 1) {
        fingerprint = params[5];
        const error = new Error('duplicate');
        error.code = 'ER_DUP_ENTRY';
        throw error;
      }
      if (sql.includes('idempotency_fingerprint')) {
        return [[{ id: 7, idempotency_fingerprint: fingerprint }]];
      }
      if (sql.includes('FROM courses c')) {
        return [[{
          id: 7,
          user_id: 12,
          nickname: 'creator',
          title: '멱등 코스',
          description: '',
          is_public: 0,
          like_count: 0,
          fork_count: 0,
        }]];
      }
      if (sql.includes('FROM course_tracks')) return [[]];
      if (sql.includes('FROM course_likes')) return [[]];
      throw new Error(`Unexpected query: ${sql}`);
    },
  };

  await withPoolStubs({ getConnection: async () => connection }, async () => {
    const res = responseRecorder();
    await createCourse(request('abcdefghijklmnop'), res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.id, 7);
  });
});

test('rejects an idempotency key reused for a different create payload', async () => {
  const connection = {
    async beginTransaction() {},
    async rollback() {},
    release() {},
    async query(sql) {
      if (sql.startsWith('INSERT INTO courses')) {
        const error = new Error('duplicate');
        error.code = 'ER_DUP_ENTRY';
        throw error;
      }
      if (sql.includes('idempotency_fingerprint')) {
        return [[{ id: 7, idempotency_fingerprint: '0'.repeat(64) }]];
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
  };

  await withPoolStubs({ getConnection: async () => connection }, async () => {
    const res = responseRecorder();
    await createCourse(request('abcdefghijklmnop'), res);
    assert.equal(res.statusCode, 409);
  });
});

test('replays only a fork of the same source course', async () => {
  const connection = {
    release() {},
    async query(sql) {
      if (sql.includes('idempotency_fingerprint')) {
        return [[{ id: 8, idempotency_fingerprint: forkFingerprint(3) }]];
      }
      if (sql.includes('FROM courses c')) {
        return [[{
          id: 8,
          user_id: 12,
          nickname: '12',
          title: '원본 코스 (포크)',
          description: '',
          is_public: 0,
          forked_from_course_id: 3,
          forked_from_title: '원본 코스',
          forked_from_author_id: 'creator',
          like_count: 0,
          fork_count: 0,
        }]];
      }
      if (sql.includes('FROM course_tracks')) return [[]];
      if (sql.includes('FROM course_likes')) return [[]];
      throw new Error(`Unexpected query: ${sql}`);
    },
  };

  await withPoolStubs({ getConnection: async () => connection }, async () => {
    const res = responseRecorder();
    await forkCourse({
      params: { id: '3' },
      user: { id: 12 },
      get: name => name === 'Idempotency-Key' ? 'qrstuvwxyzABCDEF' : null,
    }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.forkedFrom.courseId, 3);
  });
});

test('rejects a fork key that was already used for another source course', async () => {
  const connection = {
    release() {},
    async query(sql) {
      if (sql.includes('idempotency_fingerprint')) {
        return [[{ id: 8, idempotency_fingerprint: '0'.repeat(64) }]];
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
  };

  await withPoolStubs({ getConnection: async () => connection }, async () => {
    const res = responseRecorder();
    await forkCourse({
      params: { id: '4' },
      user: { id: 12 },
      get: name => name === 'Idempotency-Key' ? 'qrstuvwxyzABCDEF' : null,
    }, res);
    assert.equal(res.statusCode, 409);
  });
});

test('returns a successful fallback if read-back fails after commit', async () => {
  let call = 0;
  const connection = {
    async beginTransaction() {},
    async commit() {},
    async rollback() { throw new Error('must not roll back committed data'); },
    release() {},
    async query() {
      call += 1;
      if (call === 1) return [{ insertId: 9 }];
      return [{}];
    },
  };

  await withPoolStubs({
    getConnection: async () => connection,
    query: async () => { throw new Error('read-back unavailable'); },
  }, async () => {
    const res = responseRecorder();
    await createCourse(request('qrstuvwxyzABCDEF'), res);
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.id, 9);
    assert.equal(res.body.title, '멱등 코스');
  });
});
