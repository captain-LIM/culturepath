'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  CACHE_STATUS,
  canonicalQuery,
  createCachedPlacesService,
  createQueryCacheKey,
} = require('../src/services/cachedPlacesService');
const { ExternalApiError } = require('../src/utils/externalApiError');

const CONFIG = Object.freeze({
  enabled: true,
  ttlMs: 1_000,
  staleMaxAgeMs: 5_000,
  dbFailureCooldownMs: 500,
});

function place(contentId = '1') {
  return {
    contentId,
    contentTypeId: '14',
    title: `장소 ${contentId}`,
    cultures: ['문학'],
  };
}

function result(items = [place()]) {
  return {
    items,
    pagination: { pageNo: 1, numOfRows: 20, totalCount: items.length },
  };
}

function createLogger() {
  const warnings = [];
  return {
    warnings,
    logger: { warn(message, detail) { warnings.push({ message, detail }); } },
  };
}

test('canonicalizes equivalent query options to one secret-free cache key', () => {
  const first = canonicalQuery('searchKeyword2', {
    keyword: '  문학  ',
    arrange: 'a',
  });
  const second = canonicalQuery('searchKeyword2', {
    keyword: '문학',
    arrange: 'A',
    pageNo: '1',
    numOfRows: 20,
  });

  assert.deepEqual(first, second);
  assert.equal(createQueryCacheKey(first), createQueryCacheKey(second));
  assert.doesNotMatch(JSON.stringify(first), /serviceKey|TOUR_API_KEY/);
});

test('returns a fresh query cache without calling TourAPI', async () => {
  let upstreamCalls = 0;
  const cached = result([place('2')]);
  const service = createCachedPlacesService({
    config: CONFIG,
    clock: () => 10_000,
    repository: {
      findQuery: async () => ({
        ...cached,
        cachedAt: 9_000,
        expiresAt: 11_000,
      }),
    },
    tourApiService: {
      searchPlacesByKeyword: async () => {
        upstreamCalls += 1;
        return result();
      },
    },
  });

  const response = await service.searchPlacesByKeyword({ keyword: '문학' });

  assert.equal(response.cacheStatus, CACHE_STATUS.HIT);
  assert.equal(response.items[0].contentId, '2');
  assert.equal(upstreamCalls, 0);
});

test('reuses the generic query cache for a related-place operation', async () => {
  let fetchCalls = 0;
  const service = createCachedPlacesService({
    config: CONFIG,
    clock: () => 10_000,
    repository: {
      findQuery: async () => ({
        ...result([place('7')]),
        cachedAt: 9_000,
        expiresAt: 11_000,
      }),
    },
    tourApiService: {},
  });

  const response = await service.getCachedQuery({
    operation: 'relatedPlaces',
    input: { baseYm: '202503', contentId: '100' },
    fetchUpstream: async () => {
      fetchCalls += 1;
      return result();
    },
  });

  assert.equal(response.cacheStatus, CACHE_STATUS.HIT);
  assert.equal(response.items[0].contentId, '7');
  assert.equal(fetchCalls, 0);
  await assert.rejects(
    service.getCachedQuery({
      operation: 'invalid-operation',
      fetchUpstream: async () => result(),
    }),
    /operation/,
  );
});

test('validates empty query options before reading a warm cache', async () => {
  let cacheReads = 0;
  let upstreamCalls = 0;
  const service = createCachedPlacesService({
    config: CONFIG,
    clock: () => 10_000,
    repository: {
      findQuery: async () => {
        cacheReads += 1;
        return {
          ...result(),
          cachedAt: 9_000,
          expiresAt: 11_000,
        };
      },
    },
    tourApiService: {
      searchPlacesByKeyword: async () => {
        upstreamCalls += 1;
        return result();
      },
    },
  });

  for (const invalid of [
    { pageNo: '' },
    { numOfRows: '' },
    { arrange: '' },
  ]) {
    await assert.rejects(
      service.searchPlacesByKeyword({ keyword: '문학', ...invalid }),
      error => error.code === 'VALIDATION_ERROR',
    );
  }

  assert.equal(cacheReads, 0);
  assert.equal(upstreamCalls, 0);
});

test('refreshes and stores a query cache miss', async () => {
  let saved;
  const service = createCachedPlacesService({
    config: CONFIG,
    clock: () => 10_000,
    repository: {
      findQuery: async () => null,
      saveQuery: async input => { saved = input; },
    },
    tourApiService: {
      getAreaBasedPlaces: async () => result([place('3')]),
    },
  });

  const response = await service.getAreaBasedPlaces({
    lDongRegnCd: '48',
  });

  assert.equal(response.cacheStatus, CACHE_STATUS.REFRESHED);
  assert.equal(saved.operation, 'areaBasedList2');
  assert.equal(saved.items[0].contentId, '3');
  assert.equal(saved.cachedAt.getTime(), 10_000);
  assert.equal(saved.expiresAt.getTime(), 11_000);
  assert.match(saved.cacheKey, /^[a-f0-9]{64}$/);
});

test('returns stale query data for upstream errors except validation errors', async () => {
  const cached = {
    ...result([place('4')]),
    cachedAt: 7_000,
    expiresAt: 8_000,
  };
  const logger = createLogger();
  const repository = { findQuery: async () => cached };
  const timeoutService = createCachedPlacesService({
    config: CONFIG,
    clock: () => 10_000,
    logger: logger.logger,
    repository,
    tourApiService: {
      searchPlacesByKeyword: async () => {
        throw new ExternalApiError('timeout', {
          code: 'TIMEOUT',
          retryable: true,
        });
      },
    },
  });

  const response = await timeoutService.searchPlacesByKeyword({
    keyword: '문학',
  });
  assert.equal(response.cacheStatus, CACHE_STATUS.STALE);
  assert.equal(response.items[0].contentId, '4');
  assert.equal(logger.warnings.length, 1);
  assert.doesNotMatch(JSON.stringify(logger.warnings), /timeout/);

  const validationService = createCachedPlacesService({
    config: CONFIG,
    clock: () => 10_000,
    logger: logger.logger,
    repository,
    tourApiService: {
      searchPlacesByKeyword: async () => {
        throw new ExternalApiError('invalid', {
          code: 'VALIDATION_ERROR',
        });
      },
    },
  });
  await assert.rejects(
    validationService.searchPlacesByKeyword({ keyword: '' }),
    error => error.code === 'VALIDATION_ERROR',
  );
});

test('rejects an upstream error when stale data is older than the maximum age', async () => {
  const service = createCachedPlacesService({
    config: CONFIG,
    clock: () => 10_000,
    repository: {
      findQuery: async () => ({
        ...result(),
        cachedAt: 4_000,
        expiresAt: 5_000,
      }),
    },
    tourApiService: {
      searchPlacesByKeyword: async () => {
        throw new ExternalApiError('timeout', { code: 'TIMEOUT' });
      },
    },
  });

  await assert.rejects(
    service.searchPlacesByKeyword({ keyword: '문학' }),
    error => error.code === 'TIMEOUT',
  );
});

test('bypasses a failed DB and observes the failure cooldown', async () => {
  let reads = 0;
  let upstreamCalls = 0;
  let timestamp = 10_000;
  const logger = createLogger();
  const service = createCachedPlacesService({
    config: CONFIG,
    clock: () => timestamp,
    logger: logger.logger,
    repository: {
      findQuery: async () => {
        reads += 1;
        throw new Error('password and host must not leak');
      },
      saveQuery: async () => {
        throw new Error('must not write during cooldown');
      },
    },
    tourApiService: {
      searchPlacesByKeyword: async () => {
        upstreamCalls += 1;
        return result();
      },
    },
  });

  const first = await service.searchPlacesByKeyword({ keyword: '문학' });
  timestamp += 100;
  const second = await service.searchPlacesByKeyword({ keyword: '역사' });

  assert.equal(first.cacheStatus, CACHE_STATUS.BYPASS);
  assert.equal(second.cacheStatus, CACHE_STATUS.BYPASS);
  assert.equal(reads, 1);
  assert.equal(upstreamCalls, 2);
  assert.equal(logger.warnings.length, 1);
  assert.doesNotMatch(JSON.stringify(logger.warnings), /password|host/);
});

test('coalesces concurrent misses for the same key but not different keys', async () => {
  let upstreamCalls = 0;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const service = createCachedPlacesService({
    config: { ...CONFIG, enabled: false },
    clock: () => 10_000,
    repository: {},
    tourApiService: {
      searchPlacesByKeyword: async ({ keyword }) => {
        upstreamCalls += 1;
        await gate;
        return result([place(keyword)]);
      },
    },
  });

  const sameA = service.searchPlacesByKeyword({ keyword: '문학' });
  const sameB = service.searchPlacesByKeyword({ keyword: '문학' });
  const different = service.searchPlacesByKeyword({ keyword: '역사' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(upstreamCalls, 2);
  release();

  const [first, second, third] = await Promise.all([sameA, sameB, different]);
  assert.equal(first.items[0].contentId, '문학');
  assert.equal(second.items[0].contentId, '문학');
  assert.equal(third.items[0].contentId, '역사');
});

test('returns and refreshes detail caches using the wrapper contract', async () => {
  let upstreamCalls = 0;
  let saved;
  let cached = {
    detail: place('1'),
    detailCachedAt: 9_000,
    detailExpiresAt: 11_000,
  };
  const repository = {
    findPlace: async () => cached,
    saveDetail: async input => { saved = input; },
  };
  const service = createCachedPlacesService({
    config: CONFIG,
    clock: () => 10_000,
    repository,
    tourApiService: {
      getPlaceDetail: async () => {
        upstreamCalls += 1;
        return place('2');
      },
    },
  });

  const hit = await service.getPlaceDetail({ contentId: '1' });
  assert.equal(hit.cacheStatus, CACHE_STATUS.HIT);
  assert.equal(hit.item.contentId, '1');
  assert.equal(upstreamCalls, 0);

  cached = null;
  const refreshed = await service.getPlaceDetail({ contentId: '2' });
  assert.equal(refreshed.cacheStatus, CACHE_STATUS.REFRESHED);
  assert.equal(saved.item.contentId, '2');
  assert.equal(upstreamCalls, 1);
});

test('does not negative-cache a missing detail', async () => {
  let writes = 0;
  const service = createCachedPlacesService({
    config: CONFIG,
    clock: () => 10_000,
    repository: {
      findPlace: async () => null,
      saveDetail: async () => { writes += 1; },
    },
    tourApiService: {
      getPlaceDetail: async () => null,
    },
  });

  const response = await service.getPlaceDetail({ contentId: '999' });

  assert.equal(response.item, null);
  assert.equal(response.cacheStatus, CACHE_STATUS.BYPASS);
  assert.equal(writes, 0);
});

test('uses stale detail on TourAPI failure and never hides invalid contentId', async () => {
  let repositoryCalls = 0;
  const repository = {
    findPlace: async () => {
      repositoryCalls += 1;
      return {
        detail: place('1'),
        detailCachedAt: 7_000,
        detailExpiresAt: 8_000,
      };
    },
  };
  const service = createCachedPlacesService({
    config: CONFIG,
    clock: () => 10_000,
    repository,
    tourApiService: {
      getPlaceDetail: async ({ contentId }) => {
        throw new ExternalApiError(`invalid ${contentId}`, {
          code: contentId === 'bad' ? 'VALIDATION_ERROR' : 'TIMEOUT',
        });
      },
    },
    logger: { warn() {} },
  });

  const stale = await service.getPlaceDetail({ contentId: '1' });
  assert.equal(stale.cacheStatus, CACHE_STATUS.STALE);

  await assert.rejects(
    service.getPlaceDetail({ contentId: 'bad' }),
    error => error.code === 'VALIDATION_ERROR',
  );
  assert.equal(repositoryCalls, 1);
});

test('reports BYPASS when a cache write fails without losing upstream data', async () => {
  const logger = createLogger();
  const service = createCachedPlacesService({
    config: CONFIG,
    clock: () => 10_000,
    logger: logger.logger,
    repository: {
      findQuery: async () => null,
      saveQuery: async () => {
        throw new Error('write failed');
      },
    },
    tourApiService: {
      searchPlacesByKeyword: async () => result([place('5')]),
    },
  });

  const response = await service.searchPlacesByKeyword({ keyword: '문학' });

  assert.equal(response.cacheStatus, CACHE_STATUS.BYPASS);
  assert.equal(response.items[0].contentId, '5');
  assert.equal(logger.warnings.length, 1);
});
