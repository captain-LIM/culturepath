'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  createPlaceCacheRepository,
} = require('../src/repositories/placeCacheRepository');

function place(contentId, overrides = {}) {
  return {
    contentId,
    contentTypeId: '14',
    title: `장소 ${contentId}`,
    lDongRegnCd: '48',
    lDongSignguCd: '220',
    cultures: ['문학'],
    sourceUpdatedAt: '2026-07-23T10:00:00+09:00',
    ...overrides,
  };
}

test('loads cached query items in the original contentId order', async () => {
  const queries = [];
  const pool = {
    async query(sql, params) {
      queries.push({ sql, params });
      if (queries.length === 1) {
        return [[{
          cache_key: 'a'.repeat(64),
          operation: 'searchKeyword2',
          request_json: '{"keyword":"문학"}',
          content_ids_json: '["2","1"]',
          pagination_json: '{"pageNo":1,"numOfRows":20,"totalCount":2}',
          cached_at: new Date(1_000),
          expires_at: new Date(2_000),
        }]];
      }
      return [[
        {
          content_id: '1',
          summary_json: JSON.stringify(place('1')),
          detail_json: null,
          summary_cached_at: new Date(1_000),
          summary_expires_at: new Date(2_000),
          detail_cached_at: null,
          detail_expires_at: null,
        },
        {
          content_id: '2',
          summary_json: place('2'),
          detail_json: null,
          summary_cached_at: new Date(1_000),
          summary_expires_at: new Date(2_000),
          detail_cached_at: null,
          detail_expires_at: null,
        },
      ]];
    },
  };

  const result = await createPlaceCacheRepository({ pool })
    .findQuery('a'.repeat(64));

  assert.deepEqual(result.items.map(item => item.contentId), ['2', '1']);
  assert.deepEqual(result.pagination, {
    pageNo: 1,
    numOfRows: 20,
    totalCount: 2,
  });
  assert.match(queries[1].sql, /content_id IN \(\?, \?\)/);
  assert.deepEqual(queries[1].params, ['2', '1']);
});

test('treats a query with a missing place row as a cache miss', async () => {
  let call = 0;
  const pool = {
    async query() {
      call += 1;
      if (call === 1) {
        return [[{
          cache_key: 'b'.repeat(64),
          operation: 'areaBasedList2',
          request_json: {},
          content_ids_json: ['1', '2'],
          pagination_json: {},
          cached_at: new Date(1_000),
          expires_at: new Date(2_000),
        }]];
      }
      return [[{
        content_id: '1',
        summary_json: place('1'),
        detail_json: null,
        summary_cached_at: new Date(1_000),
        summary_expires_at: new Date(2_000),
        detail_cached_at: null,
        detail_expires_at: null,
      }]];
    },
  };

  assert.equal(
    await createPlaceCacheRepository({ pool }).findQuery('b'.repeat(64)),
    null,
  );
});

test('stores summaries and query metadata atomically without overwriting detail JSON', async () => {
  const events = [];
  const connection = {
    async beginTransaction() { events.push({ name: 'begin' }); },
    async query(sql, params) { events.push({ name: 'query', sql, params }); },
    async commit() { events.push({ name: 'commit' }); },
    async rollback() { events.push({ name: 'rollback' }); },
    release() { events.push({ name: 'release' }); },
  };
  const pool = { async getConnection() { return connection; } };
  const repository = createPlaceCacheRepository({ pool });
  const cachedAt = new Date(1_000);
  const expiresAt = new Date(2_000);

  await repository.saveQuery({
    cacheKey: 'c'.repeat(64),
    operation: 'searchKeyword2',
    request: { keyword: '문학' },
    items: [place('1'), place('2')],
    pagination: { pageNo: 1, numOfRows: 20, totalCount: 2 },
    cachedAt,
    expiresAt,
  });

  assert.deepEqual(
    events.map(event => event.name),
    ['begin', 'query', 'query', 'commit', 'release'],
  );
  const placeUpsert = events[1];
  assert.match(placeUpsert.sql, /INSERT INTO places_cache/);
  assert.doesNotMatch(
    placeUpsert.sql.split('ON DUPLICATE KEY UPDATE')[1],
    /detail_json/,
  );
  assert.equal(placeUpsert.params.length, 20);
  const queryUpsert = events[2];
  assert.equal(
    queryUpsert.params[3],
    JSON.stringify(['1', '2']),
  );
});

test('stores summary and detail fields in their SQL column order', async () => {
  let captured;
  const pool = {
    async query(sql, params) {
      captured = { sql, params };
      return [{}];
    },
  };
  const repository = createPlaceCacheRepository({ pool });
  const item = place('1', { overview: '상세 개요' });
  const cachedAt = new Date(1_000);
  const expiresAt = new Date(2_000);

  await repository.saveDetail({ item, cachedAt, expiresAt });

  assert.match(captured.sql, /detail_json = VALUES\(detail_json\)/);
  const duplicateUpdate = captured.sql.split('ON DUPLICATE KEY UPDATE')[1];
  assert.doesNotMatch(
    duplicateUpdate,
    /summary_json|summary_cached_at|summary_expires_at/,
  );
  assert.equal(captured.params[0], '1');
  const storedSummary = JSON.parse(captured.params[6]);
  assert.equal(storedSummary.contentId, item.contentId);
  assert.equal(storedSummary.overview, null);
  assert.equal(storedSummary.openTime, null);
  assert.equal(storedSummary.restDate, null);
  assert.equal('homepage' in storedSummary, false);
  assert.equal('images' in storedSummary, false);
  assert.equal('additionalInfo' in storedSummary, false);
  assert.deepEqual(JSON.parse(captured.params[7]), item);
  assert.equal(captured.params[8], item.sourceUpdatedAt);
  assert.equal(captured.params[9], cachedAt);
  assert.equal(captured.params[10], expiresAt);
  assert.equal(captured.params[11], cachedAt);
  assert.equal(captured.params[12], expiresAt);
});

test('rolls back and releases a failed query-cache transaction', async () => {
  const events = [];
  const connection = {
    async beginTransaction() { events.push('begin'); },
    async query() {
      events.push('query');
      throw new Error('db write failed');
    },
    async commit() { events.push('commit'); },
    async rollback() { events.push('rollback'); },
    release() { events.push('release'); },
  };
  const repository = createPlaceCacheRepository({
    pool: { async getConnection() { return connection; } },
  });

  await assert.rejects(
    repository.saveQuery({
      cacheKey: 'd'.repeat(64),
      operation: 'searchKeyword2',
      request: {},
      items: [place('1')],
      pagination: {},
      cachedAt: new Date(1_000),
      expiresAt: new Date(2_000),
    }),
    /db write failed/,
  );
  assert.deepEqual(events, ['begin', 'query', 'rollback', 'release']);
});
