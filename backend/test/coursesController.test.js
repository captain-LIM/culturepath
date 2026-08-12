'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const pool = require('../src/config/db');
const {
  completeCourse,
  getCourse,
  getMyLikedCourses,
  toggleLike,
} = require('../src/controllers/coursesController');

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

test('maps stored place coordinates into the course response', async () => {
  await withQueryStub(async (sql) => {
    if (sql.includes('FROM courses c')) return [[courseRow()]];
    if (sql.includes('FROM course_tracks')) {
      return [[{
        course_id: 7,
        track_number: 1,
        content_id: '100',
        place_title: '좌표 있는 장소',
        place_address: '주소',
        place_category: '문학',
        place_region: '강릉',
        place_latitude: '37.7519000',
        place_longitude: '128.8761000',
      }]];
    }
    throw new Error(`Unexpected query: ${sql}`);
  }, async () => {
    const res = responseRecorder();
    await getCourse({ params: { id: '7' } }, res);
    const place = res.body.tracks[0].places[0];
    assert.equal(place.latitude, 37.7519);
    assert.equal(place.longitude, 128.8761);
  });
});

test('leaves coordinates null when a stored place has none', async () => {
  await withQueryStub(async (sql) => {
    if (sql.includes('FROM courses c')) return [[courseRow()]];
    if (sql.includes('FROM course_tracks')) {
      return [[{
        course_id: 7,
        track_number: 1,
        content_id: '100',
        place_title: '좌표 없는 장소',
        place_address: '주소',
        place_category: '문학',
        place_region: '강릉',
        place_latitude: null,
        place_longitude: null,
      }]];
    }
    throw new Error(`Unexpected query: ${sql}`);
  }, async () => {
    const res = responseRecorder();
    await getCourse({ params: { id: '7' } }, res);
    const place = res.body.tracks[0].places[0];
    assert.equal(place.latitude, null);
    assert.equal(place.longitude, null);
  });
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

test('does not allow liking another user private course', async () => {
  await withQueryStub(async (sql, params) => {
    assert.match(sql, /is_public = TRUE OR user_id = \?/);
    assert.deepEqual(params, [7, 99]);
    return [[]];
  }, async () => {
    const res = responseRecorder();
    await toggleLike({ params: { id: '7' }, user: { id: 99 } }, res);
    assert.equal(res.statusCode, 404);
  });
});

test('does not allow completing another user private course', async () => {
  await withQueryStub(async (sql, params) => {
    assert.match(sql, /is_public = TRUE OR user_id = \?/);
    assert.deepEqual(params, [7, 99]);
    return [[]];
  }, async () => {
    const res = responseRecorder();
    await completeCourse({
      params: { id: '7' },
      user: { id: 99 },
      body: {},
    }, res);
    assert.equal(res.statusCode, 404);
  });
});

test('liked-course query filters private courses that are not owned by the caller', async () => {
  await withQueryStub(async (sql, params) => {
    assert.match(sql, /c\.is_public = TRUE OR c\.user_id = \?/);
    assert.deepEqual(params, [99, 99]);
    return [[]];
  }, async () => {
    const res = responseRecorder();
    await getMyLikedCourses({ user: { id: 99 } }, res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, []);
  });
});
