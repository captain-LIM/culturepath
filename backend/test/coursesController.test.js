'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const pool = require('../src/config/db');
const { getCourse } = require('../src/controllers/coursesController');

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

async function withQueryStub(stub, callback) {
  const original = pool.query;
  pool.query = stub;
  try {
    await callback();
  } finally {
    pool.query = original;
  }
}

function courseRow(overrides = {}) {
  return {
    id: 7,
    user_id: 12,
    nickname: 'creator',
    title: '공개 코스',
    description: '',
    is_public: 1,
    like_count: 0,
    fork_count: 0,
    ...overrides,
  };
}

test('allows guests to read a public course and filters private courses in SQL', async () => {
  const queries = [];
  await withQueryStub(async (sql, params) => {
    queries.push({ sql, params });
    if (sql.includes('FROM courses c')) return [[courseRow()]];
    if (sql.includes('FROM course_tracks')) return [[]];
    throw new Error(`Unexpected query: ${sql}`);
  }, async () => {
    const res = responseRecorder();
    await getCourse({ params: { id: '7' } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.id, 7);
    assert.equal(res.body.isOwner, false);
  });

  assert.match(queries[0].sql, /c\.is_public = TRUE/);
  assert.deepEqual(queries[0].params, [7]);
});

test('allows an authenticated owner to read a private course', async () => {
  await withQueryStub(async (sql, params) => {
    if (sql.includes('FROM courses c')) {
      assert.match(sql, /c\.user_id = \?/);
      assert.deepEqual(params, [7, 12]);
      return [[courseRow({ is_public: 0 })]];
    }
    if (sql.includes('FROM course_tracks')) return [[]];
    if (sql.includes('FROM course_likes')) return [[]];
    throw new Error(`Unexpected query: ${sql}`);
  }, async () => {
    const res = responseRecorder();
    await getCourse({ params: { id: '7' }, user: { id: 12 } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.isOwner, true);
  });
});

test('rejects invalid course ids before querying the database', async () => {
  await withQueryStub(async () => {
    throw new Error('database must not be queried');
  }, async () => {
    const res = responseRecorder();
    await getCourse({ params: { id: 'not-a-number' } }, res);
    assert.equal(res.statusCode, 404);
  });
});
