'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  CACHE_STATUS,
  canonicalDataLabQuery,
  createCachedDataLabService,
  createDataLabCacheKey,
} = require('../src/services/cachedDataLabService');
const { ExternalApiError } = require('../src/utils/externalApiError');

const CONFIG = Object.freeze({
  enabled: true,
  ttlMs: 1_000,
  staleMaxAgeMs: 5_000,
  dbFailureCooldownMs: 500,
});

function visitorResult(code = '48220') {
  return {
    header: { resultCode: '0000', resultMsg: 'OK' },
    items: [{
      level: 'local',
      code,
      name: '통영시',
      dayOfWeekCode: '4',
      dayOfWeekName: '목요일',
      visitorTypeCode: '2',
      visitorTypeName: '외지인(b)',
      visitorCount: 10.5,
      baseYmd: '20210513',
    }],
    pagination: { pageNo: 1, numOfRows: 1000, totalCount: 1 },
  };
}

test('canonicalizes DataLab cache keys without credentials or URLs', () => {
  const first = canonicalDataLabQuery('locgoRegnVisitrDDList', {
    startYmd: '20210513',
    endYmd: '20210513',
  });
  const second = canonicalDataLabQuery('locgoRegnVisitrDDList', {
    startYmd: '20210513',
    endYmd: '20210513',
    pageNo: '1',
    numOfRows: '1000',
  });

  assert.deepEqual(first, second);
  assert.equal(createDataLabCacheKey(first), createDataLabCacheKey(second));
  assert.doesNotMatch(
    JSON.stringify(first),
    /serviceKey|TOUR_API_KEY|DATALAB_API_BASE_URL/,
  );
});

test('returns a fresh DataLab cache without an upstream call', async () => {
  let upstreamCalls = 0;
  const service = createCachedDataLabService({
    config: CONFIG,
    clock: () => 10_000,
    repository: {
      findQuery: async () => ({
        response: visitorResult('48850'),
        cachedAt: 9_000,
        expiresAt: 11_000,
      }),
    },
    dataLabService: {
      getAllLocalVisitors: async () => {
        upstreamCalls += 1;
        return visitorResult();
      },
    },
  });

  const result = await service.getAllLocalVisitors({
    startYmd: '20210513',
    endYmd: '20210513',
  });

  assert.equal(result.cacheStatus, CACHE_STATUS.HIT);
  assert.equal(result.items[0].code, '48850');
  assert.equal(upstreamCalls, 0);
});

test('refreshes a miss and stores the normalized DataLab response', async () => {
  let saved;
  const service = createCachedDataLabService({
    config: CONFIG,
    clock: () => 10_000,
    repository: {
      findQuery: async () => null,
      saveQuery: async input => { saved = input; },
    },
    dataLabService: {
      getAllMetropolitanVisitors: async () => visitorResult('48'),
    },
  });

  const result = await service.getAllMetropolitanVisitors({
    startYmd: '20210513',
    endYmd: '20210513',
  });

  assert.equal(result.cacheStatus, CACHE_STATUS.REFRESHED);
  assert.equal(saved.operation, 'metcoRegnVisitrDDList');
  assert.equal(saved.response.items[0].code, '48');
  assert.equal(saved.request.startYmd, '20210513');
});

test('returns stale data on upstream failure and bypasses a failed DB', async () => {
  const staleService = createCachedDataLabService({
    config: CONFIG,
    clock: () => 10_000,
    repository: {
      findQuery: async () => ({
        response: visitorResult('48850'),
        cachedAt: 7_000,
        expiresAt: 8_000,
      }),
    },
    dataLabService: {
      getAllLocalVisitors: async () => {
        throw new ExternalApiError('network', {
          code: 'NETWORK_ERROR',
          service: 'dataLab',
          operation: 'locgoRegnVisitrDDList',
        });
      },
    },
    logger: { warn() {} },
  });
  const stale = await staleService.getAllLocalVisitors({
    startYmd: '20210513',
    endYmd: '20210513',
  });
  assert.equal(stale.cacheStatus, CACHE_STATUS.STALE);
  assert.equal(stale.items[0].code, '48850');

  let reads = 0;
  const bypassService = createCachedDataLabService({
    config: CONFIG,
    clock: () => 10_000,
    repository: {
      findQuery: async () => {
        reads += 1;
        throw new Error('db unavailable');
      },
    },
    dataLabService: {
      getAllLocalVisitors: async () => visitorResult(),
    },
    logger: { warn() {} },
  });
  const first = await bypassService.getAllLocalVisitors({
    startYmd: '20210513',
    endYmd: '20210513',
  });
  const second = await bypassService.getAllLocalVisitors({
    startYmd: '20210506',
    endYmd: '20210506',
  });

  assert.equal(first.cacheStatus, CACHE_STATUS.BYPASS);
  assert.equal(second.cacheStatus, CACHE_STATUS.BYPASS);
  assert.equal(reads, 1);
});

test('coalesces concurrent DataLab cache misses for the same date', async () => {
  let upstreamCalls = 0;
  const service = createCachedDataLabService({
    config: CONFIG,
    clock: () => 10_000,
    repository: {
      findQuery: async () => null,
      saveQuery: async () => {},
    },
    dataLabService: {
      async getAllLocalVisitors() {
        upstreamCalls += 1;
        await new Promise(resolve => setTimeout(resolve, 10));
        return visitorResult();
      },
    },
  });
  const input = { startYmd: '20210513', endYmd: '20210513' };

  const [first, second] = await Promise.all([
    service.getAllLocalVisitors(input),
    service.getAllLocalVisitors(input),
  ]);

  assert.equal(first.cacheStatus, CACHE_STATUS.REFRESHED);
  assert.equal(second.cacheStatus, CACHE_STATUS.REFRESHED);
  assert.equal(upstreamCalls, 1);
});

test('keeps cache lookup inside single-flight across a delayed second miss', async () => {
  let reads = 0;
  let upstreamCalls = 0;
  let releaseUpstream;
  let notifyUpstreamStarted;
  const upstreamStarted = new Promise(resolve => {
    notifyUpstreamStarted = resolve;
  });
  const upstreamGate = new Promise(resolve => {
    releaseUpstream = resolve;
  });
  let releaseSecondRead;
  const secondReadGate = new Promise(resolve => {
    releaseSecondRead = resolve;
  });
  const service = createCachedDataLabService({
    config: CONFIG,
    clock: () => 10_000,
    repository: {
      async findQuery() {
        reads += 1;
        if (reads === 2) {
          await secondReadGate;
        }
        return null;
      },
      saveQuery: async () => {},
    },
    dataLabService: {
      async getAllLocalVisitors() {
        upstreamCalls += 1;
        notifyUpstreamStarted();
        if (upstreamCalls === 1) {
          await upstreamGate;
        }
        return visitorResult();
      },
    },
  });
  const input = { startYmd: '20210513', endYmd: '20210513' };

  const firstPromise = service.getAllLocalVisitors(input);
  await upstreamStarted;
  const secondPromise = service.getAllLocalVisitors(input);
  releaseUpstream();
  const first = await firstPromise;
  releaseSecondRead();
  const second = await secondPromise;

  assert.equal(first.cacheStatus, CACHE_STATUS.REFRESHED);
  assert.equal(second.cacheStatus, CACHE_STATUS.REFRESHED);
  assert.equal(reads, 1);
  assert.equal(upstreamCalls, 1);
});
