'use strict';

const crypto = require('node:crypto');
const { getPlaceCacheConfig } = require('../config/placeCache');
const placeCacheRepository = require('../repositories/placeCacheRepository');
const tourApiService = require('./tourApiService');
const {
  normalizeAreaBasedPlaceOptions,
  normalizeKeywordPlaceOptions,
} = tourApiService;
const { ExternalApiError } = require('../utils/externalApiError');

const CACHE_STATUS = Object.freeze({
  BYPASS: 'BYPASS',
  HIT: 'HIT',
  REFRESHED: 'REFRESHED',
  STALE: 'STALE',
});
const QUERY_FIELDS = Object.freeze([
  'keyword',
  'lDongRegnCd',
  'lDongSignguCd',
  'contentTypeId',
  'lclsSystm1',
  'lclsSystm2',
  'lclsSystm3',
]);

function normalizeClockValue(value) {
  const timestamp = value instanceof Date ? value.getTime() : Number(value);
  if (!Number.isFinite(timestamp)) {
    throw new TypeError('캐시 clock은 유효한 시각을 반환해야 합니다.');
  }
  return timestamp;
}

function canonicalScalar(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const normalized = String(value).trim();
  return normalized || null;
}

function canonicalInteger(value, fallback) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return fallback;
  }
  const normalized = Number(value);
  return Number.isInteger(normalized) ? normalized : canonicalScalar(value);
}

function canonicalQuery(operation, options = {}) {
  const request = {
    arrange: (canonicalScalar(options.arrange) || 'A').toUpperCase(),
    numOfRows: canonicalInteger(options.numOfRows, 20),
    pageNo: canonicalInteger(options.pageNo, 1),
  };
  for (const field of QUERY_FIELDS) {
    const value = canonicalScalar(options[field]);
    if (value !== null) {
      request[field] = value;
    }
  }
  return Object.freeze({ operation, ...request });
}

function createQueryCacheKey(request) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(request))
    .digest('hex');
}

function canUseStale(error) {
  return (
    error instanceof ExternalApiError &&
    error.code !== 'VALIDATION_ERROR'
  );
}

function createCachedPlacesService(options = {}) {
  const upstream = options.tourApiService || tourApiService;
  const repository = options.repository || placeCacheRepository;
  const config = options.config || getPlaceCacheConfig();
  const clock = options.clock || Date.now;
  const logger = options.logger || console;
  const inFlight = new Map();
  let dbUnavailableUntil = 0;

  function now() {
    return normalizeClockValue(clock());
  }

  function isFresh(record, timestamp) {
    return record && record.expiresAt > timestamp;
  }

  function isStaleUsable(record, timestamp) {
    return (
      record &&
      record.cachedAt <= timestamp &&
      record.cachedAt + config.staleMaxAgeMs > timestamp
    );
  }

  function markDatabaseFailure(error, operation, timestamp) {
    dbUnavailableUntil = Math.max(
      dbUnavailableUntil,
      timestamp + config.dbFailureCooldownMs,
    );
    logger?.warn?.('장소 캐시 DB를 일시적으로 우회합니다.', {
      cacheOperation: operation,
      errorName: error?.name || 'Error',
    });
  }

  async function readCache(method, key, operation, timestamp) {
    if (!config.enabled || timestamp < dbUnavailableUntil) {
      return { available: false, value: null };
    }

    try {
      return { available: true, value: await repository[method](key) };
    } catch (error) {
      markDatabaseFailure(error, operation, timestamp);
      return { available: false, value: null };
    }
  }

  async function writeCache(method, input, operation, timestamp) {
    if (!config.enabled || timestamp < dbUnavailableUntil) {
      return false;
    }

    try {
      await repository[method](input);
      return true;
    } catch (error) {
      markDatabaseFailure(error, operation, timestamp);
      return false;
    }
  }

  function runSingleFlight(key, task) {
    const existing = inFlight.get(key);
    if (existing) {
      return existing;
    }

    const promise = Promise.resolve()
      .then(task)
      .finally(() => {
        if (inFlight.get(key) === promise) {
          inFlight.delete(key);
        }
      });
    inFlight.set(key, promise);
    return promise;
  }

  async function getQuery(operation, input, fetchUpstream) {
    const request = canonicalQuery(operation, input);
    const cacheKey = createQueryCacheKey(request);
    const timestamp = now();
    const cacheRead = await readCache(
      'findQuery',
      cacheKey,
      operation,
      timestamp,
    );
    const cached = cacheRead.value;

    if (isFresh(cached, timestamp)) {
      return {
        items: cached.items,
        pagination: cached.pagination,
        cacheStatus: CACHE_STATUS.HIT,
      };
    }

    return runSingleFlight(`query:${cacheKey}`, async () => {
      try {
        const result = await fetchUpstream();
        const refreshedAt = now();
        const stored = cacheRead.available && await writeCache(
          'saveQuery',
          {
            cacheKey,
            operation,
            request,
            items: result.items,
            pagination: result.pagination,
            cachedAt: new Date(refreshedAt),
            expiresAt: new Date(refreshedAt + config.ttlMs),
          },
          operation,
          refreshedAt,
        );
        return {
          ...result,
          cacheStatus: stored
            ? CACHE_STATUS.REFRESHED
            : CACHE_STATUS.BYPASS,
        };
      } catch (error) {
        const failedAt = now();
        if (isStaleUsable(cached, failedAt) && canUseStale(error)) {
          logger?.warn?.('TourAPI 장애로 오래된 장소 검색 캐시를 반환합니다.', {
            cacheOperation: operation,
            errorName: error.name,
          });
          return {
            items: cached.items,
            pagination: cached.pagination,
            cacheStatus: CACHE_STATUS.STALE,
          };
        }
        throw error;
      }
    });
  }

  async function getPlaceDetail(input = {}) {
    const contentId = canonicalScalar(input.contentId);
    if (!contentId || !/^\d+$/.test(contentId)) {
      const item = await upstream.getPlaceDetail(input);
      return { item, cacheStatus: CACHE_STATUS.BYPASS };
    }
    const timestamp = now();
    const cacheRead = await readCache(
      'findPlace',
      contentId,
      'placeDetail',
      timestamp,
    );
    const cachedPlace = cacheRead.value;
    const cached = cachedPlace?.detail
      ? {
        item: cachedPlace.detail,
        cachedAt: cachedPlace.detailCachedAt,
        expiresAt: cachedPlace.detailExpiresAt,
      }
      : null;

    if (isFresh(cached, timestamp)) {
      return { item: cached.item, cacheStatus: CACHE_STATUS.HIT };
    }

    return runSingleFlight(`detail:${contentId}`, async () => {
      try {
        const item = await upstream.getPlaceDetail(input);
        const refreshedAt = now();
        if (!item) {
          return {
            item: null,
            cacheStatus: CACHE_STATUS.BYPASS,
          };
        }

        const stored = cacheRead.available && await writeCache(
          'saveDetail',
          {
            item,
            cachedAt: new Date(refreshedAt),
            expiresAt: new Date(refreshedAt + config.ttlMs),
          },
          'placeDetail',
          refreshedAt,
        );
        return {
          item,
          cacheStatus: stored
            ? CACHE_STATUS.REFRESHED
            : CACHE_STATUS.BYPASS,
        };
      } catch (error) {
        const failedAt = now();
        if (isStaleUsable(cached, failedAt) && canUseStale(error)) {
          logger?.warn?.('TourAPI 장애로 오래된 장소 상세 캐시를 반환합니다.', {
            cacheOperation: 'placeDetail',
            errorName: error.name,
          });
          return { item: cached.item, cacheStatus: CACHE_STATUS.STALE };
        }
        throw error;
      }
    });
  }

  return Object.freeze({
    async getAreaBasedPlaces(input) {
      const normalized = normalizeAreaBasedPlaceOptions(input);
      return getQuery(
        'areaBasedList2',
        normalized,
        () => upstream.getAreaBasedPlaces(normalized),
      );
    },
    getPlaceDetail,
    async searchPlacesByKeyword(input) {
      const normalized = normalizeKeywordPlaceOptions(input);
      return getQuery(
        'searchKeyword2',
        normalized,
        () => upstream.searchPlacesByKeyword(normalized),
      );
    },
  });
}

let defaultService;

function getDefaultService() {
  if (!defaultService) {
    defaultService = createCachedPlacesService();
  }
  return defaultService;
}

module.exports = {
  CACHE_STATUS,
  canonicalQuery,
  createCachedPlacesService,
  createQueryCacheKey,
  getAreaBasedPlaces: input => getDefaultService().getAreaBasedPlaces(input),
  getPlaceDetail: input => getDefaultService().getPlaceDetail(input),
  searchPlacesByKeyword: input =>
    getDefaultService().searchPlacesByKeyword(input),
};
