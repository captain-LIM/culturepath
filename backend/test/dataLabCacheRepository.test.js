'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  createDataLabCacheRepository,
} = require('../src/repositories/dataLabCacheRepository');

test('loads UTF-8 DataLab JSON cache rows and timestamps', async () => {
  const pool = {
    async query(sql, params) {
      assert.match(sql, /FROM data_lab_query_cache/);
      assert.deepEqual(params, ['a'.repeat(64)]);
      return [[{
        cache_key: 'a'.repeat(64),
        operation: 'locgoRegnVisitrDDList',
        request_json: Buffer.from(
          '{"startYmd":"20210513","endYmd":"20210513"}',
          'utf8',
        ),
        response_json: JSON.stringify({
          items: [{ code: '48220', name: '통영시' }],
          pagination: { totalCount: 1 },
        }),
        cached_at: new Date(1_000),
        expires_at: new Date(2_000),
      }]];
    },
  };

  const result = await createDataLabCacheRepository({ pool })
    .findQuery('a'.repeat(64));

  assert.equal(result.response.items[0].name, '통영시');
  assert.equal(result.cachedAt, 1_000);
  assert.equal(result.expiresAt, 2_000);
});

test('stores request and normalized response JSON in one upsert', async () => {
  let captured;
  const pool = {
    async query(sql, params) {
      captured = { sql, params };
      return [{}];
    },
  };
  const repository = createDataLabCacheRepository({ pool });

  await repository.saveQuery({
    cacheKey: 'b'.repeat(64),
    operation: 'metcoRegnVisitrDDList',
    request: { startYmd: '20210513', endYmd: '20210513' },
    response: {
      items: [{ code: '48', name: '경상남도', visitorCount: 12.5 }],
      pagination: { totalCount: 1 },
    },
    cachedAt: new Date(1_000),
    expiresAt: new Date(2_000),
  });

  assert.match(captured.sql, /INSERT INTO data_lab_query_cache/);
  assert.match(captured.sql, /ON DUPLICATE KEY UPDATE/);
  assert.equal(captured.params[0], 'b'.repeat(64));
  assert.deepEqual(JSON.parse(captured.params[2]), {
    startYmd: '20210513',
    endYmd: '20210513',
  });
  assert.equal(
    JSON.parse(captured.params[3]).items[0].name,
    '경상남도',
  );
});
