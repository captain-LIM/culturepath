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

// EngService2/JpnService2는 KorService2와 별개의 contentId 공간을 쓰기 때문에
// (같은 장소도 서로 다른 ID), 국문 contentId로 번역 서비스 상세를 직접 조회할
// 수 없다. 번역 서비스의 keyword 검색은 번역된 제목만 대상으로 하기 때문에
// 국문 제목으로는 거의 매칭되지 않는다(실측: EngService2에 국문 키워드로
// 검색하면 0건). 대신 국문 좌표 주변을 locationBasedList2로 조회한 뒤, 후보
// 제목에 국문 제목이 포함되는지로 동일 장소 여부를 확인하고 그중 가장 가까운
// 결과를 채택한다.
const SUPPORTED_TRANSLATION_LANGS = Object.freeze(new Set(['en', 'ja']));
const TRANSLATION_MATCH_RADIUS_METERS = 500;
const MAX_TRANSLATION_MATCH_DISTANCE_METERS = 500;

function normalizeForTitleMatch(value) {
  return String(value || '').replace(/[\s()·\-,./]/g, '');
}

// 번역 서비스 제목은 보통 "English Name (국문 이름)" 형태로 끝에 국문 이름을
// 괄호로 덧붙인다. 국문 정식 명칭에 부속시설명이 붙는 경우(예: "오죽헌·시립박물관")
// 완전 일치는 아니므로, 양쪽이 서로를 포함하는지(부분집합 관계)로 판단한다.
function extractTrailingParenthetical(title) {
  const match = /\(([^()]+)\)\s*$/.exec(String(title || '').trim());
  return match ? match[1] : null;
}

function titleLooksLikeSamePlace(korTitle, candidateTitle) {
  const normalizedKorTitle = normalizeForTitleMatch(korTitle);
  if (!normalizedKorTitle) {
    return false;
  }
  if (normalizeForTitleMatch(candidateTitle).includes(normalizedKorTitle)) {
    return true;
  }
  const parenthetical = extractTrailingParenthetical(candidateTitle);
  const normalizedParenthetical = normalizeForTitleMatch(parenthetical);
  return (
    normalizedParenthetical.length > 0 &&
    (normalizedKorTitle.includes(normalizedParenthetical) ||
      normalizedParenthetical.includes(normalizedKorTitle))
  );
}

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

const TRANSLATION_OVERLAY_FIELDS = Object.freeze([
  'title',
  'address',
  'overview',
  'regionName',
  'openTime',
  'restDate',
  'parking',
]);

function applyTranslationOverlay(korItem, translatedItem) {
  if (!translatedItem) {
    return { ...korItem, hasTranslatedInfo: false };
  }

  const overlaid = { ...korItem, hasTranslatedInfo: true };
  for (const field of TRANSLATION_OVERLAY_FIELDS) {
    if (translatedItem[field]) {
      overlaid[field] = translatedItem[field];
    }
  }
  if (translatedItem.additionalInfo?.length) {
    overlaid.additionalInfo = translatedItem.additionalInfo;
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

  async function findTranslatedContentId(korItem, lang) {
    if (!korItem.title || korItem.latitude == null || korItem.longitude == null) {
      return null;
    }

    const searchResult = await upstream.searchPlacesByLocationTranslated(lang, {
      latitude: korItem.latitude,
      longitude: korItem.longitude,
      radius: TRANSLATION_MATCH_RADIUS_METERS,
      numOfRows: 20,
    });

    let bestContentId = null;
    let bestDistance = Infinity;
    for (const candidate of searchResult.items) {
      if (candidate.latitude == null || candidate.longitude == null) {
        continue;
      }
      if (!titleLooksLikeSamePlace(korItem.title, candidate.title)) {
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

    return bestDistance <= MAX_TRANSLATION_MATCH_DISTANCE_METERS ? bestContentId : null;
  }

  async function getTranslatedDetail(contentId, korItem, lang) {
    const cacheOperation = `placeDetail:${lang}`;
    const timestamp = now();
    const cacheRead = await readCache(
      'findPlace',
      contentId,
      cacheOperation,
      timestamp,
    );
    const cachedPlace = cacheRead.value;
    const cachedTranslation = cachedPlace?.translations?.[lang];
    // cachedAt이 있으면 "조회는 해봤다"는 뜻이라, detail이 null이어도(번역이
    // 없다고 확인된 상태) 캐시 히트로 취급해 API를 다시 호출하지 않는다.
    const cached = cachedTranslation?.cachedAt != null
      ? {
        item: cachedTranslation.detail,
        cachedAt: cachedTranslation.cachedAt,
        expiresAt: cachedTranslation.expiresAt,
      }
      : null;

    if (isFresh(cached, timestamp)) {
      return { item: cached.item, cacheStatus: CACHE_STATUS.HIT };
    }

    return runSingleFlight(`detail:${lang}:${contentId}`, async () => {
      try {
        const matchedContentId = await findTranslatedContentId(korItem, lang);
        const item = matchedContentId
          ? await upstream.getPlaceDetailTranslated(lang, { contentId: matchedContentId })
          : null;
        const refreshedAt = now();
        await writeCache(
          'saveDetailTranslation',
          {
            contentId,
            lang,
            item,
            cachedAt: new Date(refreshedAt),
            expiresAt: new Date(refreshedAt + config.ttlMs),
          },
          cacheOperation,
          refreshedAt,
        );
        return {
          item,
          cacheStatus: item ? CACHE_STATUS.REFRESHED : CACHE_STATUS.BYPASS,
        };
      } catch (error) {
        const failedAt = now();
        if (isStaleUsable(cached, failedAt) && canUseStale(error)) {
          logger?.warn?.('TourAPI 장애로 오래된 장소 번역 상세 캐시를 반환합니다.', {
            cacheOperation,
            errorName: error.name,
          });
          return { item: cached.item, cacheStatus: CACHE_STATUS.STALE };
        }
        // 번역 상세 조회 실패는 전체 요청을 실패시키지 않는다. 국문 정보로 대체한다.
        logger?.warn?.('번역 장소 상세 조회에 실패해 국문 정보로 대체합니다.', {
          cacheOperation,
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
    if (!korResult.item || !SUPPORTED_TRANSLATION_LANGS.has(input.lang)) {
      return korResult;
    }

    const translated = await getTranslatedDetail(contentId, korResult.item, input.lang);
    return {
      item: applyTranslationOverlay(korResult.item, translated.item),
      cacheStatus: korResult.cacheStatus,
    };
  }

  // 지역 장소 목록처럼 여러 건을 한 번에 보여줄 때 쓰는 가벼운 버전이다.
  // 상세 화면과 같은 검색+좌표 매칭·캐시 로직을 재사용한다.
  async function attachTranslationOverlay(items, lang) {
    return Promise.all(
      items.map(async item => {
        const contentId = canonicalScalar(item.contentId);
        if (!contentId) {
          return item;
        }
        const translated = await getTranslatedDetail(contentId, item, lang);
        return applyTranslationOverlay(item, translated.item);
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
    attachTranslationOverlay,
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
  attachTranslationOverlay: (items, lang) =>
    getDefaultService().attachTranslationOverlay(items, lang),
  searchPlacesByKeyword: input =>
    getDefaultService().searchPlacesByKeyword(input),
};
