'use strict';

const crypto = require('node:crypto');
const { getPlaceCacheConfig } = require('../config/placeCache');
const placeCacheRepository = require('../repositories/placeCacheRepository');
const tourApiService = require('./tourApiService');
const llmService = require('./llmService');
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

// EngService2/JpnService2/ChsService2는 KorService2와 별개의 contentId 공간을
// 쓰기 때문에(같은 장소도 서로 다른 ID), 국문 contentId로 번역 서비스 상세를
// 직접 조회할 수 없다. 번역 서비스의 keyword 검색은 번역된 제목만 대상으로
// 하기 때문에 국문 제목으로는 거의 매칭되지 않는다(실측: EngService2에 국문
// 키워드로 검색하면 0건). 대신 국문 좌표 주변을 locationBasedList2로 조회한
// 뒤, 제목 토큰이 가장 많이 겹치는 후보를 같은 장소로 채택한다.
const SUPPORTED_TRANSLATION_LANGS = Object.freeze(new Set(['en', 'ja', 'zh']));
const TRANSLATION_MATCH_RADIUS_METERS = 500;
const MAX_TRANSLATION_MATCH_DISTANCE_METERS = 500;

// 번역 서비스 제목은 보통 "English Name (국문 이름)" 형태로 끝에 국문 이름을
// 괄호로 덧붙이지만, 서비스마다 괄호 없이 국문을 이어 붙이거나("Ojukheon강릉
// 오죽헌") 부속기관명 표기가 다르기도 하다("강릉 오죽헌" vs "강릉시 오죽헌").
// 그래서 국문 제목 전체 일치 대신 공백·구분기호로 나눈 토큰 단위로 얼마나
// 겹치는지를 점수화해서 가장 많이 겹치는 후보를 채택한다.
function extractTrailingParenthetical(title) {
  const match = /\(([^()]+)\)\s*$/.exec(String(title || '').trim());
  return match ? match[1] : null;
}

function extractTokens(value) {
  return String(value || '')
    .split(/[\s()·\-,./]+/)
    .map(token => token.trim())
    .filter(token => token.length >= 2);
}

// 부분 문자열 포함만으로 같은 토큰으로 인정하면, "북촌"처럼 짧고 흔한
// 동네 이름이 "북촌전통공예체험관"(공백 없는 복합 국문 제목) 같은 완전히
// 다른 장소 이름 안에이만 우연히 들어있어도 매칭돼 버린다 — 실제로
// "북촌전통공예체험관"이 인근의 무관한 "락고재 서울 북촌 한옥호텔"로 잘못
// 매칭되는 걸 확인했다. 짧은 토큰이 긴 토큰의 절반 이상을 차지할 때만
// 부분 일치로 인정해 이런 동네 이름 오매칭을 막는다.
function tokensMatch(a, b) {
  if (a === b) {
    return true;
  }
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  if (!longer.includes(shorter)) {
    return false;
  }
  return shorter.length >= Math.max(3, Math.ceil(longer.length / 2));
}

function countMatchingTokens(korTitle, candidateTitle) {
  const korTokens = extractTokens(korTitle);
  const candidateTokens = extractTokens(
    extractTrailingParenthetical(candidateTitle) || candidateTitle,
  );
  if (korTokens.length === 0 || candidateTokens.length === 0) {
    return 0;
  }
  return korTokens.filter(token =>
    candidateTokens.some(candidateToken => tokensMatch(token, candidateToken)),
  ).length;
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

// TourAPI 국문·번역 서비스는 서로 별개의 데이터라 좌표+제목으로 매칭해야
// 하는데(findTranslatedContentId), 등록이 안 된 작은 장소는 애초에 매칭될
// 후보 자체가 없다. 이런 장소는 TourAPI에 없는 걸 찾을 수 없으므로, 이미
// 검증된 국문 필드를 LLM으로 그대로 번역해 채운다 — 상세 화면에 실제로
// 노출되는 TRANSLATION_OVERLAY_FIELDS 전부(parking·regionName 포함)를
// 다룬다. 새로운 사실을 지어내지 않고 순수 번역만 하므로 다른 AI 기능들과
// 같은 "검증된 데이터만 다룬다" 원칙 안에 있다.
const PLACE_TRANSLATION_SYSTEM_PROMPT = `당신은 여행 정보 번역기입니다.
입력으로 주어진 한국어 관광지 정보(title, address, openTime, overview,
restDate, parking, regionName)를 요청된 언어로 자연스럽게 번역하세요. 원문에
없는 사실을 추가하거나 지어내지 말고 번역만 하세요. 값이 비어 있으면 빈
문자열을 그대로 반환하세요.`;

const PLACE_TRANSLATION_LANG_NAMES = Object.freeze({
  en: 'English',
  ja: '日本語 (Japanese)',
  zh: '简体中文 (Simplified Chinese)',
});

const PLACE_TRANSLATION_FIELDS = Object.freeze([
  'title', 'address', 'openTime', 'overview', 'restDate', 'parking', 'regionName',
]);

const PLACE_TRANSLATION_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: [...PLACE_TRANSLATION_FIELDS],
  properties: {
    title: { type: 'string' },
    address: { type: 'string' },
    openTime: { type: 'string' },
    overview: { type: 'string' },
    restDate: { type: 'string' },
    parking: { type: 'string' },
    regionName: { type: 'string' },
  },
});

function parseTranslationJson(content) {
  let text = String(content || '').trim();
  if (text.startsWith('```')) {
    text = text.replace(/^```[a-z]*\s*/i, '').replace(/\s*```$/, '');
  }
  const value = JSON.parse(text);
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('장소 번역 결과가 JSON 객체가 아닙니다.');
  }
  return value;
}

async function translatePlaceFieldsWithLlm(korItem, lang, generator, logger) {
  if (!generator || generator.isMockMode(process.env)) {
    return null;
  }
  try {
    // overview는 장문일 수 있어 다른 필드보다 넉넉한 출력 토큰이 필요하다.
    // OpenRouter 클라이언트가 OPENROUTER_MAX_OUTPUT_TOKENS를 넘는 값을 주면
    // TypeError로 거부하므로 그 설정값을 상한으로 맞춘다.
    const overviewLength = String(korItem?.overview || '').length;
    const configuredMaxTokens = Number(process.env.OPENROUTER_MAX_OUTPUT_TOKENS) || 1600;
    const maxTokens = Math.min(configuredMaxTokens, 400 + overviewLength * 2);
    const response = await generator.generate(
      PLACE_TRANSLATION_SYSTEM_PROMPT,
      [{
        role: 'user',
        content: JSON.stringify({
          targetLanguage: PLACE_TRANSLATION_LANG_NAMES[lang] || lang,
          place: {
            title: korItem?.title || '',
            address: korItem?.address || '',
            openTime: korItem?.openTime || '',
            overview: korItem?.overview || '',
            restDate: korItem?.restDate || '',
            parking: korItem?.parking || '',
            regionName: korItem?.regionName || '',
          },
        }),
      }],
      {
        jsonSchema: { name: 'culturepath_place_translation', schema: PLACE_TRANSLATION_SCHEMA },
        maxTokens,
        temperature: 0,
      },
    );
    const parsed = parseTranslationJson(response.content);
    const fields = {};
    for (const field of PLACE_TRANSLATION_FIELDS) {
      const value = typeof parsed[field] === 'string' ? parsed[field].trim() : '';
      if (value) {
        fields[field] = value;
      }
    }
    if (Object.keys(fields).length === 0) {
      return null;
    }
    return fields;
  } catch (error) {
    logger?.warn?.('장소 기계번역에 실패해 국문 정보로 대체합니다.', {
      errorName: error?.name || 'Error',
    });
    return null;
  }
}

function createCachedPlacesService(options = {}) {
  const upstream = options.tourApiService || tourApiService;
  const repository = options.repository || placeCacheRepository;
  const config = options.config || getPlaceCacheConfig();
  const clock = options.clock || Date.now;
  const logger = options.logger || console;
  const llm = options.llmService || llmService;
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
    let bestScore = 0;
    let bestDistance = Infinity;
    for (const candidate of searchResult.items) {
      if (candidate.latitude == null || candidate.longitude == null) {
        continue;
      }
      const score = countMatchingTokens(korItem.title, candidate.title);
      if (score === 0) {
        continue;
      }
      const distance = haversineMeters(
        korItem.latitude,
        korItem.longitude,
        candidate.latitude,
        candidate.longitude,
      );
      if (score > bestScore || (score === bestScore && distance < bestDistance)) {
        bestScore = score;
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
        let item = matchedContentId
          ? await upstream.getPlaceDetailTranslated(lang, { contentId: matchedContentId })
          : null;
        // TourAPI 번역 서비스에 아예 등록되지 않은(매칭 후보가 없는) 장소는
        // 검증된 국문 title·address·openTime을 LLM으로 번역해 채운다.
        if (!item) {
          item = await translatePlaceFieldsWithLlm(korItem, lang, llm, logger);
        }
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
