'use strict';

const crypto = require('node:crypto');
const { getDataLabCacheConfig } = require('../config/dataLabCache');
const dataLabCacheRepository = require('../repositories/dataLabCacheRepository');
const dataLabService = require('./dataLabService');
const { ExternalApiError } = require('../utils/externalApiError');

const CACHE_STATUS = Object.freeze({
  BYPASS: 'BYPASS',
  HIT: 'HIT',
  REFRESHED: 'REFRESHED',
  STALE: 'STALE',
});

function normalizeClockValue(value) {
  const timestamp = value instanceof Date ? value.getTime() : Number(value);
  if (!Number.isFinite(timestamp)) {
    throw new TypeError('DataLab 캐시 clock은 유효한 시각을 반환해야 합니다.');
  }
  return timestamp;
}

function canonicalDataLabQuery(operation, input = {}) {
  const request = dataLabService.normalizeVisitorRequest(
    { ...input, pageNo: 1 },
    operation,
  );
  return Object.freeze({ operation, ...request });
}

function createDataLabCacheKey(request) {
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

function createCachedDataLabService(options = {}) {
  const upstream = options.dataLabService || dataLabService;
  const repository = options.repository || dataLabCacheRepository;
  const config = options.config || getDataLabCacheConfig();
  const clock = options.clock || Date.now;
  const logger = options.logger || console;
  const inFlight = new Map();
  let dbUnavailableUntil = 0;

  function now() {
    return normalizeClockValue(clock());
  }

  function markDatabaseFailure(error, operation, timestamp) {
    dbUnavailableUntil = Math.max(
      dbUnavailableUntil,
      timestamp + config.dbFailureCooldownMs,
    );
    logger?.warn?.('DataLab 캐시 DB를 일시적으로 우회합니다.', {
      cacheOperation: operation,
      errorName: error?.name || 'Error',
    });
  }

  async function readCache(cacheKey, operation, timestamp) {
    if (!config.enabled || timestamp < dbUnavailableUntil) {
      return { available: false, value: null };
    }
    try {
      return {
        available: true,
        value: await repository.findQuery(cacheKey),
      };
    } catch (error) {
      markDatabaseFailure(error, operation, timestamp);
      return { available: false, value: null };
    }
  }

  async function writeCache(input, operation, timestamp) {
    if (!config.enabled || timestamp < dbUnavailableUntil) {
      return false;
    }
    try {
      await repository.saveQuery(input);
      return true;
    } catch (error) {
      markDatabaseFailure(error, operation, timestamp);
      return false;
    }
  }

  function runSingleFlight(key, task) {
    if (inFlight.has(key)) {
      return inFlight.get(key);
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
    const request = canonicalDataLabQuery(operation, input);
    const cacheKey = createDataLabCacheKey(request);

    return runSingleFlight(`dataLab:${cacheKey}`, async () => {
      const timestamp = now();
      const cacheRead = await readCache(cacheKey, operation, timestamp);
      const cached = cacheRead.value;

      if (cached && cached.expiresAt > timestamp) {
        return { ...cached.response, cacheStatus: CACHE_STATUS.HIT };
      }

      try {
        const response = await fetchUpstream(request);
        const refreshedAt = now();
        const stored = cacheRead.available && await writeCache(
          {
            cacheKey,
            operation,
            request,
            response,
            cachedAt: new Date(refreshedAt),
            expiresAt: new Date(refreshedAt + config.ttlMs),
          },
          operation,
          refreshedAt,
        );
        return {
          ...response,
          cacheStatus: stored
            ? CACHE_STATUS.REFRESHED
            : CACHE_STATUS.BYPASS,
        };
      } catch (error) {
        const failedAt = now();
        const staleUsable =
          cached &&
          cached.cachedAt <= failedAt &&
          cached.cachedAt + config.staleMaxAgeMs > failedAt;
        if (staleUsable && canUseStale(error)) {
          logger?.warn?.('DataLab 장애로 오래된 지역 방문자 캐시를 반환합니다.', {
            cacheOperation: operation,
            errorName: error?.name || 'Error',
          });
          return { ...cached.response, cacheStatus: CACHE_STATUS.STALE };
        }
        throw error;
      }
    });
  }

  return Object.freeze({
    getAllMetropolitanVisitors(input = {}) {
      return getQuery(
        dataLabService.OPERATIONS.metropolitan,
        input,
        request => upstream.getAllMetropolitanVisitors(request),
      );
    },
    getAllLocalVisitors(input = {}) {
      return getQuery(
        dataLabService.OPERATIONS.local,
        input,
        request => upstream.getAllLocalVisitors(request),
      );
    },
  });
}

let defaultService;

function getDefaultService() {
  if (!defaultService) {
    defaultService = createCachedDataLabService();
  }
  return defaultService;
}

module.exports = {
  CACHE_STATUS,
  canonicalDataLabQuery,
  createCachedDataLabService,
  createDataLabCacheKey,
  getAllLocalVisitors: input =>
    getDefaultService().getAllLocalVisitors(input),
  getAllMetropolitanVisitors: input =>
    getDefaultService().getAllMetropolitanVisitors(input),
};
