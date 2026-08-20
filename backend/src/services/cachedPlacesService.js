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
  'baseYm',
  'contentId',
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

// EngService2는 KorService2와 별개의 contentId 공간을 쓰기 때문에(같은 장소도
// 서로 다른 ID), 국문 contentId로 영문 상세를 직접 조회할 수 없다. 대신 국문
// 제목으로 영문 서비스를 키워드 검색한 뒤, 좌표가 가장 가까운 결과를 같은
// 장소로 판단한다.
const MAX_ENGLISH_MATCH_DISTANCE_METERS = 150;

function haversineMeters(lat1, lon1, lat2, lon2) {
  const earthRadius = 6371000;
  const toRad = deg => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const ENGLISH_OVERLAY_FIELDS = Object.freeze([
  'title',
  'address',
  'overview',
  'regionName',
  'openTime',
  'restDate',
  'parking',
]);

function applyEnglishOverlay(korItem, engItem) {
  if (!engItem) {
    return { ...korItem, hasEnglishInfo: false };
  }

  const overlaid = { ...korItem, hasEnglishInfo: true };
  for (const field of ENGLISH_OVERLAY_FIELDS) {
    if (engItem[field]) {
      overlaid[field] = engItem[field];
    }
  }
  if (engItem.additionalInfo?.length) {
    overlaid.additionalInfo = engItem.additionalInfo;
  }
  return overlaid;
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

  async function getKoreanDetail(input, contentId) {
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

  async function findEnglishContentId(korItem) {
    if (!korItem.title || korItem.latitude == null || korItem.longitude == null) {
      return null;
    }

    const searchResult = await upstream.searchPlacesByKeywordEng({
      keyword: korItem.title,
      numOfRows: 10,
    });

    let bestContentId = null;
    let bestDistance = Infinity;
    for (const candidate of searchResult.items) {
      if (candidate.latitude == null || candidate.longitude == null) {
        continue;
      }
      const distance = haversineMeters(
        korItem.latitude,
        korItem.longitude,
        candidate.latitude,
        candidate.longitude,
      );
      if (distance < bestDistance) {
        bestDistance = distance;
        bestContentId = candidate.contentId;
      }
    }

    return bestDistance <= MAX_ENGLISH_MATCH_DISTANCE_METERS ? bestContentId : null;
  }

  async function getEnglishDetail(contentId, korItem) {
    const timestamp = now();
    const cacheRead = await readCache(
      'findPlace',
      contentId,
      'placeDetailEn',
      timestamp,
    );
    const cachedPlace = cacheRead.value;
    // detailCachedAtEn이 있으면 "조회는 해봤다"는 뜻이라, detailEn이 null이어도
    // (번역이 없다고 확인된 상태) 캐시 히트로 취급해 API를 다시 호출하지 않는다.
    const cached = cachedPlace?.detailCachedAtEn != null
      ? {
        item: cachedPlace.detailEn,
        cachedAt: cachedPlace.detailCachedAtEn,
        expiresAt: cachedPlace.detailExpiresAtEn,
      }
      : null;

    if (isFresh(cached, timestamp)) {
      return { item: cached.item, cacheStatus: CACHE_STATUS.HIT };
    }

    return runSingleFlight(`detailEn:${contentId}`, async () => {
      try {
        const matchedContentId = await findEnglishContentId(korItem);
        const item = matchedContentId
          ? await upstream.getPlaceDetailEng({ contentId: matchedContentId })
          : null;
        const refreshedAt = now();
        await writeCache(
          'saveDetailEn',
          {
            contentId,
            item,
            cachedAt: new Date(refreshedAt),
            expiresAt: new Date(refreshedAt + config.ttlMs),
          },
          'placeDetailEn',
          refreshedAt,
        );
        return {
          item,
          cacheStatus: item ? CACHE_STATUS.REFRESHED : CACHE_STATUS.BYPASS,
        };
      } catch (error) {
        const failedAt = now();
        if (isStaleUsable(cached, failedAt) && canUseStale(error)) {
          logger?.warn?.('TourAPI 장애로 오래된 장소 영문 상세 캐시를 반환합니다.', {
            cacheOperation: 'placeDetailEn',
            errorName: error.name,
          });
          return { item: cached.item, cacheStatus: CACHE_STATUS.STALE };
        }
        // 영문 상세 조회 실패는 전체 요청을 실패시키지 않는다. 국문 정보로 대체한다.
        logger?.warn?.('영문 장소 상세 조회에 실패해 국문 정보로 대체합니다.', {
          cacheOperation: 'placeDetailEn',
          errorName: error?.name || 'Error',
        });
        return { item: null, cacheStatus: CACHE_STATUS.BYPASS };
      }
    });
  }

  async function getPlaceDetail(input = {}) {
    const contentId = canonicalScalar(input.contentId);
    if (!contentId || !/^\d+$/.test(contentId)) {
      const item = await upstream.getPlaceDetail(input);
      return { item, cacheStatus: CACHE_STATUS.BYPASS };
    }

    const korResult = await getKoreanDetail(input, contentId);
    if (!korResult.item || input.lang !== 'en') {
      return korResult;
    }

    const engResult = await getEnglishDetail(contentId, korResult.item);
    return {
      item: applyEnglishOverlay(korResult.item, engResult.item),
      cacheStatus: korResult.cacheStatus,
    };
  }

  // 지역 장소 목록처럼 여러 건을 한 번에 보여줄 때 쓰는 가벼운 버전이다.
  // 상세 화면과 같은 검색+좌표 매칭·캐시 로직을 재사용한다.
  async function attachEnglishOverlay(items) {
    return Promise.all(
      items.map(async item => {
        const contentId = canonicalScalar(item.contentId);
        if (!contentId) {
          return item;
        }
        const engResult = await getEnglishDetail(contentId, item);
        return applyEnglishOverlay(item, engResult.item);
      }),
    );
  }

  return Object.freeze({
    async getCachedQuery({ operation, input, fetchUpstream } = {}) {
      if (
        typeof operation !== 'string' ||
        !/^[A-Za-z][A-Za-z0-9]{0,29}$/.test(operation)
      ) {
        throw new TypeError('캐시 operation 형식이 올바르지 않습니다.');
      }
      if (typeof fetchUpstream !== 'function') {
        throw new TypeError('캐시 fetchUpstream 함수가 필요합니다.');
      }
      return getQuery(operation, input, fetchUpstream);
    },
    async getAreaBasedPlaces(input) {
      const normalized = normalizeAreaBasedPlaceOptions(input);
      return getQuery(
        'areaBasedList2',
        normalized,
        () => upstream.getAreaBasedPlaces(normalized),
      );
    },
    getPlaceDetail,
    attachEnglishOverlay,
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
  getCachedQuery: input => getDefaultService().getCachedQuery(input),
  getAreaBasedPlaces: input => getDefaultService().getAreaBasedPlaces(input),
  getPlaceDetail: input => getDefaultService().getPlaceDetail(input),
  attachEnglishOverlay: items => getDefaultService().attachEnglishOverlay(items),
  searchPlacesByKeyword: input =>
    getDefaultService().searchPlacesByKeyword(input),
};
