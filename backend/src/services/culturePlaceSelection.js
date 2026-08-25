'use strict';

const {
  CULTURE_CATEGORIES,
  CULTURE_SEARCH_KEYWORDS,
  MAX_CULTURE_RESULTS,
  classifyTourPlace,
  getCultureMatchStrength,
} = require('../config/cultureCategoryMap');

const CACHE_STATUS_PRIORITY = Object.freeze({
  HIT: 1,
  REFRESHED: 2,
  BYPASS: 3,
  STALE: 4,
});

function isSupportedCulture(culture) {
  return CULTURE_CATEGORIES.includes(culture);
}

function reclassifyPlace(place) {
  const cultures = classifyTourPlace(place);
  return {
    ...place,
    cultures,
    category: cultures[0] || '기타',
  };
}

function selectPlacesForCulture(placeGroups, culture, options = {}) {
  if (!isSupportedCulture(culture)) {
    throw new RangeError('지원하지 않는 문화 카테고리입니다.');
  }

  const requestedLimit = Number(options.limit);
  const maximumLimit = options.allowCumulative === true
    ? Number.MAX_SAFE_INTEGER
    : MAX_CULTURE_RESULTS;
  const limit = Number.isInteger(requestedLimit) && requestedLimit > 0
    ? Math.min(requestedLimit, maximumLimit)
    : MAX_CULTURE_RESULTS;
  const candidates = new Map();
  let discoveryIndex = 0;

  for (const group of placeGroups) {
    for (const originalPlace of Array.isArray(group) ? group : []) {
      const place = reclassifyPlace(originalPlace);
      const strength = getCultureMatchStrength(place, culture);
      const contentId = String(place.contentId || '').trim();
      const index = discoveryIndex;
      discoveryIndex += 1;

      if (!contentId || strength === 0) {
        continue;
      }

      const existing = candidates.get(contentId);
      if (!existing) {
        candidates.set(contentId, { place, strength, index });
        continue;
      }

      if (strength > existing.strength) {
        candidates.set(contentId, {
          place,
          strength,
          index: existing.index,
        });
      }
    }
  }

  return [...candidates.values()]
    .sort((left, right) =>
      right.strength - left.strength || left.index - right.index,
    )
    .slice(0, limit)
    .map(candidate => candidate.place);
}

function combineCultureCacheStatus(primaryStatus, secondaryStatus) {
  return [primaryStatus, secondaryStatus]
    .filter(Boolean)
    .sort((left, right) =>
      (CACHE_STATUS_PRIORITY[right] || 0) -
      (CACHE_STATUS_PRIORITY[left] || 0),
    )[0];
}

function resultHasNextPage(result) {
  const pageNo = Number(result?.pagination?.pageNo);
  const numOfRows = Number(result?.pagination?.numOfRows);
  const totalCount = Number(result?.pagination?.totalCount);
  return Number.isInteger(pageNo) && pageNo > 0 &&
    Number.isInteger(numOfRows) && numOfRows > 0 &&
    Number.isFinite(totalCount) && pageNo * numOfRows < totalCount;
}

async function collectAreaPlacePage({ placesService, requests, pagination, logger = console }) {
  const pageNo = pagination.pageNo;
  const pageSize = pagination.numOfRows;
  const offset = (pageNo - 1) * pageSize;
  const calls = [];

  for (let upstreamPage = 1; upstreamPage <= pageNo; upstreamPage += 1) {
    for (const baseRequest of requests) {
      calls.push(placesService.getAreaBasedPlaces({
        ...baseRequest,
        pageNo: upstreamPage,
        numOfRows: pageSize,
      }));
    }
  }

  const settled = await Promise.allSettled(calls);
  const latestResults = settled
    .slice((pageNo - 1) * requests.length)
    .filter(result => result.status === 'fulfilled')
    .map(result => result.value);
  const successes = [];
  const failures = [];
  settled.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      successes.push(result.value);
      return;
    }
    failures.push(result.reason);
    logger?.warn?.('지역 장소 후보 일부를 불러오지 못했습니다.', {
      candidateSource: `area:${index}`,
      errorName: result.reason?.name || 'Error',
    });
  });
  if (successes.length === 0) {
    throw failures[0];
  }

  const unique = new Map();
  for (const result of successes) {
    for (const place of result.items || []) {
      const contentId = String(place?.contentId || '').trim();
      if (contentId && !unique.has(contentId)) {
        unique.set(contentId, place);
      }
    }
  }
  const candidates = [...unique.values()];
  return Object.freeze({
    items: candidates.slice(offset, offset + pageSize),
    cacheStatus: successes
      .map(result => result.cacheStatus)
      .reduce(combineCultureCacheStatus, undefined),
    hasMore: candidates.length > offset + pageSize ||
      latestResults.some(resultHasNextPage),
    partial: failures.length > 0,
  });
}

async function collectCulturePlacePage({
  placesService,
  culture,
  request,
  requests,
  limit,
  candidateFilter = () => true,
  logger = console,
}) {
  if (!placesService || typeof placesService.getAreaBasedPlaces !== 'function' ||
      typeof placesService.searchPlacesByKeyword !== 'function') {
    throw new TypeError('문화 장소 수집에는 장소 조회 서비스가 필요합니다.');
  }
  if (!isSupportedCulture(culture)) {
    throw new RangeError('지원하지 않는 문화 카테고리입니다.');
  }
  if (typeof candidateFilter !== 'function') {
    throw new TypeError('문화 장소 후보 필터는 함수여야 합니다.');
  }

  const requestedLimit = Number(limit);
  const pageSize = Number.isInteger(requestedLimit) && requestedLimit > 0
    ? Math.min(requestedLimit, MAX_CULTURE_RESULTS)
    : MAX_CULTURE_RESULTS;
  const requestedPage = Number(request?.pageNo);
  const pageNo = Number.isInteger(requestedPage) && requestedPage > 0
    ? requestedPage
    : 1;
  const offset = (pageNo - 1) * pageSize;
  const requestedEnd = offset + pageSize;
  const selectionLimit = requestedEnd + 1;
  const baseRequests = Array.isArray(requests) && requests.length > 0
    ? requests
    : [request];
  const keywords = CULTURE_SEARCH_KEYWORDS[culture];
  const successes = [];
  const pageSuccesses = Array.from({ length: pageNo }, () => []);
  const failures = [];

  function record(settled, source, pageIndex) {
    if (settled.status === 'fulfilled') {
      const filtered = {
        ...settled.value,
        items: (settled.value.items || []).filter(candidateFilter),
      };
      successes.push(filtered);
      pageSuccesses[pageIndex].push(filtered);
      return;
    }
    failures.push(settled.reason);
    logger?.warn?.('문화 장소 후보 일부를 불러오지 못했습니다.', {
      candidateSource: source,
      errorName: settled.reason?.name || 'Error',
    });
  }

  async function fetchSources(upstreamPage, sources) {
    const calls = [];
    for (const keyword of sources) {
      for (const baseRequest of baseRequests) {
        const pageRequest = {
          ...baseRequest,
          pageNo: upstreamPage,
          numOfRows: pageSize,
        };
        calls.push(keyword === null
          ? placesService.getAreaBasedPlaces(pageRequest)
          : placesService.searchPlacesByKeyword({ ...pageRequest, keyword }));
      }
    }
    const results = await Promise.allSettled(calls);
    results.forEach((result, index) =>
      record(result, `page:${upstreamPage}:candidate:${index}`, upstreamPage - 1));
  }

  const activeSources = [null, keywords[0]];
  await fetchSources(1, activeSources);
  let firstPageMatches = selectPlacesForCulture(
    pageSuccesses[0].map(result => result.items),
    culture,
    { limit: pageSize },
  );
  let keywordIndex = 1;
  while (firstPageMatches.length < pageSize && keywordIndex < keywords.length) {
    const keyword = keywords[keywordIndex];
    await fetchSources(1, [keyword]);
    activeSources.push(keyword);
    keywordIndex += 1;
    firstPageMatches = selectPlacesForCulture(
      pageSuccesses[0].map(result => result.items),
      culture,
      { limit: pageSize },
    );
  }

  for (let upstreamPage = 2; upstreamPage <= pageNo; upstreamPage += 1) {
    await fetchSources(upstreamPage, activeSources);
  }

  const selectedById = new Map();
  for (const pageResults of pageSuccesses) {
    const rankedPage = selectPlacesForCulture(
      pageResults.map(result => result.items),
      culture,
      { limit: selectionLimit, allowCumulative: true },
    );
    for (const place of rankedPage) {
      if (!selectedById.has(place.contentId)) {
        selectedById.set(place.contentId, place);
      }
    }
  }
  const selected = [...selectedById.values()].slice(0, selectionLimit);

  if (successes.length === 0) {
    throw failures[0];
  }

  return Object.freeze({
    items: selected.slice(offset, offset + pageSize),
    cacheStatus: successes
      .map(result => result.cacheStatus)
      .reduce(combineCultureCacheStatus, undefined),
    hasMore: selected.length > requestedEnd ||
      pageSuccesses[pageNo - 1].some(resultHasNextPage),
    partial: failures.length > 0,
  });
}

module.exports = {
  collectAreaPlacePage,
  collectCulturePlacePage,
  combineCultureCacheStatus,
  isSupportedCulture,
  resultHasNextPage,
  reclassifyPlace,
  selectPlacesForCulture,
};
