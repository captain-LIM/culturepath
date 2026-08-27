'use strict';

const cachedPlacesService = require('./cachedPlacesService');
const placeCacheRepository = require('../repositories/placeCacheRepository');
const {
  CULTURE_CATEGORIES,
  CULTURE_OFFICIAL_QUERY_CODES,
  MAX_CULTURE_RESULTS,
} = require('../config/cultureCategoryMap');
const { REGION_DEFINITIONS } = require('../config/regionCatalog');
const { getTourRegionCodes } = require('../config/tourRegionCodes');
const {
  collectCulturePlacePage,
  combineCultureCacheStatus,
  selectPlacesForCulture,
} = require('./culturePlaceSelection');

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 20;

function normalizeLimit(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0
    ? Math.min(parsed, MAX_LIMIT)
    : DEFAULT_LIMIT;
}

function toSource(place, region, culture) {
  const contentId = String(place?.contentId || '').trim();
  const title = String(place?.title || '').trim();
  if (!/^\d+$/.test(contentId) || !title) return null;
  return Object.freeze({
    contentId,
    title: title.slice(0, 200),
    address: String(place.address || '').slice(0, 500),
    category: culture,
    cultures: Array.isArray(place.cultures) ? [...place.cultures] : [culture],
    region,
    regionName: REGION_DEFINITIONS[region]?.name || region,
    contentTypeId: place.contentTypeId == null ? null : String(place.contentTypeId),
    imageUrl: place.imageUrl || null,
    thumbnailUrl: place.thumbnailUrl || null,
    latitude: place.latitude ?? null,
    longitude: place.longitude ?? null,
    trustedSource: true,
  });
}

function isPlaceInRegion(place, regionRequests) {
  const regionCode = String(place?.lDongRegnCd || '').trim();
  const districtCode = String(place?.lDongSignguCd || '').trim();
  return regionRequests.some(request =>
    regionCode === request.lDongRegnCd &&
    (!request.lDongSignguCd || districtCode === request.lDongSignguCd),
  );
}

function createAiCandidateResolver(options = {}) {
  const placesService = options.placesService || cachedPlacesService;
  const cacheRepository = options.cacheRepository || placeCacheRepository;
  const logger = options.logger || console;

  async function collectOfficialCandidates(regionRequests, culture, limit) {
    const officialQuery = CULTURE_OFFICIAL_QUERY_CODES[culture];
    if (!officialQuery) return { items: [], cacheStatus: null, partial: false };

    const settled = await Promise.allSettled(regionRequests.map(request =>
      placesService.getAreaBasedPlaces({
        ...request,
        ...officialQuery,
        pageNo: 1,
        numOfRows: Math.min(limit, MAX_CULTURE_RESULTS),
      }),
    ));
    const successes = settled
      .filter(result => result.status === 'fulfilled')
      .map(result => result.value);
    const failures = settled.filter(result => result.status === 'rejected');
    for (const failure of failures) {
      logger?.warn?.('AI 공식 문화 코드 후보 일부를 불러오지 못했습니다.', {
        errorName: failure.reason?.name || 'Error',
      });
    }
    if (successes.length === 0 && failures.length > 0) throw failures[0].reason;
    return {
      items: selectPlacesForCulture(
        successes.map(result => result.items || []),
        culture,
        { limit },
      ),
      cacheStatus: successes
        .map(result => result.cacheStatus)
        .reduce(combineCultureCacheStatus, undefined),
      partial: failures.length > 0,
    };
  }

  async function collectCulture(region, culture, limit) {
    if (!CULTURE_CATEGORIES.includes(culture)) {
      throw new RangeError('지원하지 않는 문화 카테고리입니다.');
    }
    const tourCodes = getTourRegionCodes(region);
    if (!tourCodes) throw new RangeError('지원하지 않는 지역입니다.');
    const requests = tourCodes.map(codes => ({
      ...codes,
      pageNo: 1,
      numOfRows: Math.min(limit, MAX_CULTURE_RESULTS),
    }));

    let official = { items: [], cacheStatus: null, partial: false };
    try {
      official = await collectOfficialCandidates(requests, culture, limit);
    } catch (error) {
      logger?.warn?.('AI 공식 문화 코드 조회 실패 후 일반 후보로 보완합니다.', {
        errorName: error?.name || 'Error',
      });
      official = { items: [], cacheStatus: null, partial: true };
    }

    if (official.items.length >= limit) return official;

    const expanded = await collectCulturePlacePage({
      placesService,
      culture,
      request: requests[0],
      requests,
      limit,
      logger,
    });
    const byId = new Map();
    for (const item of [...official.items, ...expanded.items]) {
      const contentId = String(item?.contentId || '').trim();
      if (contentId && !byId.has(contentId)) byId.set(contentId, item);
    }
    return {
      items: [...byId.values()].slice(0, limit),
      cacheStatus: combineCultureCacheStatus(official.cacheStatus, expanded.cacheStatus),
      partial: official.partial || expanded.partial,
    };
  }

  async function resolve({ region, cultures, limit } = {}) {
    const normalizedRegion = String(region || '').trim();
    if (!REGION_DEFINITIONS[normalizedRegion]) {
      throw new RangeError('지원하지 않는 지역입니다.');
    }
    const normalizedCultures = [...new Set(Array.isArray(cultures) ? cultures : [])]
      .filter(culture => CULTURE_CATEGORIES.includes(culture));
    if (normalizedCultures.length === 0) {
      return Object.freeze({
        items: [],
        cacheStatus: null,
        partial: false,
        region: normalizedRegion,
      });
    }

    const maxItems = normalizeLimit(limit);
    const perCultureLimit = Math.max(3, Math.ceil(maxItems / normalizedCultures.length));
    const settled = await Promise.allSettled(normalizedCultures.map(culture =>
      collectCulture(normalizedRegion, culture, perCultureLimit)
        .then(result => ({ ...result, culture })),
    ));
    const successes = settled
      .filter(result => result.status === 'fulfilled')
      .map(result => result.value);
    const failures = settled.filter(result => result.status === 'rejected');
    if (successes.length === 0 && failures.length > 0) throw failures[0].reason;

    const byId = new Map();
    for (const result of successes) {
      for (const place of result.items) {
        const source = toSource(place, normalizedRegion, result.culture);
        if (source && !byId.has(source.contentId)) byId.set(source.contentId, source);
      }
    }
    return Object.freeze({
      items: [...byId.values()].slice(0, maxItems),
      cacheStatus: successes
        .map(result => result.cacheStatus)
        .reduce(combineCultureCacheStatus, undefined),
      partial: failures.length > 0 || successes.some(result => result.partial),
      region: normalizedRegion,
    });
  }

  async function rehydrate({ contentIds, region, cultures, limit } = {}) {
    const normalizedIds = [...new Set(Array.isArray(contentIds) ? contentIds.map(String) : [])]
      .filter(contentId => /^\d+$/.test(contentId));
    const normalizedCultures = [...new Set(Array.isArray(cultures) ? cultures : [])]
      .filter(culture => CULTURE_CATEGORIES.includes(culture));
    const regionRequests = getTourRegionCodes(region);
    if (!REGION_DEFINITIONS[region] || !regionRequests) {
      throw new RangeError('지원하지 않는 지역입니다.');
    }
    if (normalizedIds.length === 0 || normalizedCultures.length === 0) {
      return resolve({ region, cultures: normalizedCultures, limit });
    }

    try {
      const records = await cacheRepository.findPlaces(normalizedIds);
      if (!records) return resolve({ region, cultures: normalizedCultures, limit });
      const summaries = records
        .map(record => record?.summary)
        .filter(place => place && isPlaceInRegion(place, regionRequests));
      const cultureById = new Map();
      for (const culture of normalizedCultures) {
        for (const place of selectPlacesForCulture([summaries], culture, {
          limit: MAX_LIMIT,
        })) {
          const contentId = String(place.contentId);
          if (!cultureById.has(contentId)) cultureById.set(contentId, culture);
        }
      }
      const byId = new Map(summaries.map(place => [String(place.contentId), place]));
      const items = normalizedIds
        .map(contentId => {
          const culture = cultureById.get(contentId);
          return culture ? toSource(byId.get(contentId), region, culture) : null;
        })
        .filter(Boolean)
        .slice(0, normalizeLimit(limit));
      return Object.freeze({
        items,
        cacheStatus: 'HIT',
        partial: items.length < normalizedIds.length,
        region,
      });
    } catch (error) {
      logger?.warn?.('AI 세션 후보 MySQL 재검증 실패 후 조건 검색으로 복구합니다.', {
        errorName: error?.name || 'Error',
      });
      return resolve({ region, cultures: normalizedCultures, limit });
    }
  }

  async function getDetail({ contentId } = {}) {
    const normalizedId = String(contentId || '').trim();
    if (!/^\d+$/.test(normalizedId)) {
      throw new RangeError('올바른 TourAPI contentId가 필요합니다.');
    }
    const result = await placesService.getPlaceDetail({ contentId: normalizedId });
    const item = result?.item;
    if (!item) {
      return Object.freeze({ item: null, cacheStatus: result?.cacheStatus || null });
    }
    if (String(item.contentId || '') !== normalizedId) {
      throw new RangeError('관광지 상세 contentId가 요청과 일치하지 않습니다.');
    }
    return Object.freeze({
      item: Object.freeze({
        overview: String(item.overview || '').slice(0, 1500),
        openTime: String(item.openTime || '').slice(0, 300),
        restDate: String(item.restDate || '').slice(0, 300),
        parking: String(item.parking || '').slice(0, 300),
        tel: String(item.tel || '').slice(0, 100),
        homepage: String(item.homepage || '').slice(0, 500),
      }),
      cacheStatus: result?.cacheStatus || null,
    });
  }

  return Object.freeze({ collectCulture, getDetail, rehydrate, resolve });
}

module.exports = {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  createAiCandidateResolver,
  normalizeLimit,
  isPlaceInRegion,
  toSource,
};
