'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  DEFAULT_MAX_PENDING_ACQUISITIONS,
  DEFAULT_USAGE_QUERY_TIMEOUT_MS,
  MAX_CONTENT_IDS,
  createCoursePlaceUsageRepository,
  normalizeContentIds,
} = require('../src/repositories/coursePlaceUsageRepository');

function fakePool(query) {
  return {
    async getConnection() {
      return {
        query,
        release() {},
        destroy() {},
      };
    },
  };
}

test('normalizes and deduplicates content IDs while preserving first order', () => {
  assert.deepEqual(
    normalizeContentIds([' 100 ', '200', '100', null, '']),
    ['100', '200'],
  );
  assert.throws(
    () => normalizeContentIds(Array.from({ length: MAX_CONTENT_IDS + 1 }, (_, i) => i)),
    RangeError,
  );
  assert.throws(() => normalizeContentIds('100'), TypeError);
});

test('aggregates public courses in one parameterized query', async () => {
  const calls = [];
  const repository = createCoursePlaceUsageRepository({
    pool: fakePool(async options => {
      calls.push(options);
      return [[
        { content_id: '100', public_course_count: 2 },
        { content_id: '200', public_course_count: '1' },
      ]];
    }),
  });

  const counts = await repository.findPublicCourseCounts(['100', '200', '100']);

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].values, ['100', '200']);
  assert.equal(calls[0].timeout, DEFAULT_USAGE_QUERY_TIMEOUT_MS);
  assert.equal(DEFAULT_MAX_PENDING_ACQUISITIONS, 4);
  assert.match(calls[0].sql, /COUNT\(DISTINCT ct\.course_id\)/);
  assert.match(calls[0].sql, /c\.is_public = TRUE/);
  assert.match(calls[0].sql, /ct\.content_id IN \(\?, \?\)/);
  assert.deepEqual([...counts.entries()], [['100', 2], ['200', 1]]);
});

test('skips the database for an empty content ID list', async () => {
  let calls = 0;
  const repository = createCoursePlaceUsageRepository({
    pool: fakePool(async () => {
      calls += 1;
      return [[]];
    }),
  });

  const counts = await repository.findPublicCourseCounts([]);

  assert.equal(calls, 0);
  assert.equal(counts.size, 0);
});

test('rejects invalid aggregate counts instead of exposing corrupt metadata', async () => {
  const repository = createCoursePlaceUsageRepository({
    pool: fakePool(async () =>
      [[{ content_id: '100', public_course_count: '-1' }]]),
  });

  await assert.rejects(
    repository.findPublicCourseCounts(['100']),
    /사용 횟수가 올바르지 않습니다/,
  );
});

test('bounds pool acquisition and releases a connection that arrives too late', async () => {
  let resolveConnection;
  let releases = 0;
  const repository = createCoursePlaceUsageRepository({
    pool: {
      getConnection() {
        return new Promise(resolve => { resolveConnection = resolve; });
      },
    },
    timeoutMs: 5,
  });

  await assert.rejects(
    repository.findPublicCourseCounts(['100']),
    error => error.code === 'PLACE_USAGE_TIMEOUT',
  );
  resolveConnection({ release() { releases += 1; } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(releases, 1);
});

test('fails fast when late pool acquisitions fill the bounded wait queue', async () => {
  const resolvers = [];
  let calls = 0;
  let releases = 0;
  const repository = createCoursePlaceUsageRepository({
    pool: {
      getConnection() {
        calls += 1;
        return new Promise(resolve => { resolvers.push(resolve); });
      },
    },
    maxPendingAcquisitions: 1,
    timeoutMs: 5,
  });

  await assert.rejects(
    repository.findPublicCourseCounts(['100']),
    error => error.code === 'PLACE_USAGE_TIMEOUT',
  );
  await assert.rejects(
    repository.findPublicCourseCounts(['200']),
    error => error.code === 'PLACE_USAGE_BUSY',
  );
  assert.equal(calls, 1);

  resolvers[0]({ release() { releases += 1; } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(releases, 1);
});

test('destroys a connection when the aggregate query exceeds its deadline', async () => {
  let destroys = 0;
  let releases = 0;
  const repository = createCoursePlaceUsageRepository({
    pool: {
      async getConnection() {
        return {
          query() { return new Promise(() => {}); },
          destroy() { destroys += 1; },
          release() { releases += 1; },
        };
      },
    },
    timeoutMs: 5,
  });

  await assert.rejects(
    repository.findPublicCourseCounts(['100']),
    error => error.code === 'PLACE_USAGE_TIMEOUT',
  );
  assert.equal(destroys, 1);
  assert.equal(releases, 0);
});
