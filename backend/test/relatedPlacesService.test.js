'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  createRelatedPlacesService,
  isSamePlace,
  normalizeMatchTitle,
} = require('../src/services/relatedPlacesService');
const { ExternalApiError } = require('../src/utils/externalApiError');

function place(contentId, title, overrides = {}) {
  return {
    contentId,
    contentTypeId: '12',
    title,
    lDongRegnCd: '11',
    lDongSignguCd: '530',
    cultures: [],
    category: '기타',
    ...overrides,
  };
}

function relation(rank, title, overrides = {}) {
  return {
    sourceTitle: '가리봉시장',
    sourceAreaCd: '11',
    sourceSignguCd: '11530',
    title,
    lDongRegnCd: '11',
    lDongSignguCd: '530',
    rank,
    ...overrides,
  };
}

test('normalizes punctuation while requiring the same legal district', () => {
  const related = relation(1, '연관 장소-A');

  assert.equal(normalizeMatchTitle(' 연관 장소 A '), '연관장소a');
  assert.equal(isSamePlace(place('2', '연관 장소 A'), related), true);
  assert.equal(
    isSamePlace(
      place('2', '연관 장소 A', { lDongSignguCd: '440' }),
      related,
    ),
    false,
  );
});

test('maps the top five related candidates, preserving rank and removing self and duplicates', async () => {
  const origin = place('100', '가리봉시장');
  const relations = [
    relation(3, '중복 장소'),
    relation(1, '연관 장소-A'),
    relation(2, '가리봉시장'),
    relation(4, '중복 장소'),
    relation(5, '지역 불일치'),
    relation(6, '호출하면 안 되는 장소'),
  ];
  const searchCalls = [];
  let cacheRequest;
  let relatedRequest;
  const mappedByKeyword = {
    '연관 장소-A': [place('200', '연관 장소 A')],
    가리봉시장: [origin],
    '중복 장소': [place('300', '중복 장소')],
    '지역 불일치': [
      place('400', '지역 불일치', { lDongSignguCd: '440' }),
    ],
  };
  const placesService = {
    getPlaceDetail: async () => ({ item: origin, cacheStatus: 'HIT' }),
    async getCachedQuery(request) {
      cacheRequest = request;
      return {
        ...await request.fetchUpstream(),
        cacheStatus: 'REFRESHED',
      };
    },
    async searchPlacesByKeyword(input) {
      searchCalls.push(input);
      return {
        items: mappedByKeyword[input.keyword] || [],
        pagination: {},
        cacheStatus: 'HIT',
      };
    },
  };
  const service = createRelatedPlacesService({
    baseYm: '202503',
    placesService,
    relatedTourApiService: {
      async searchRelatedPlacesByKeyword(input) {
        relatedRequest = input;
        return { items: relations, pagination: {} };
      },
    },
  });

  const result = await service.getRelatedPlaces({ contentId: '100' });

  assert.equal(result.cacheStatus, 'REFRESHED');
  assert.deepEqual(result.items.map(item => item.contentId), ['200', '300']);
  assert.equal(searchCalls.length, 5);
  assert.doesNotMatch(JSON.stringify(searchCalls), /호출하면 안 되는 장소/);
  assert.deepEqual(
    { operation: cacheRequest.operation, input: cacheRequest.input },
    {
      operation: 'relatedPlaces',
      input: { baseYm: '202503', contentId: '100' },
    },
  );
  assert.deepEqual(relatedRequest, {
    baseYm: '202503',
    areaCd: '11',
    signguCd: '11530',
    keyword: '가리봉시장',
    pageNo: 1,
    numOfRows: 5,
  });
});

test('returns null for a missing origin and an empty cached result without legal codes', async () => {
  let cacheCalls = 0;
  let relatedCalls = 0;
  const missing = createRelatedPlacesService({
    baseYm: '202503',
    placesService: {
      getPlaceDetail: async () => ({ item: null, cacheStatus: 'BYPASS' }),
      async getCachedQuery(request) {
        return request.fetchUpstream();
      },
    },
    relatedTourApiService: {},
  });
  assert.equal(
    await missing.getRelatedPlaces({ contentId: '999' }),
    null,
  );

  const noRegion = createRelatedPlacesService({
    baseYm: '202503',
    placesService: {
      getPlaceDetail: async () => ({
        item: place('100', '지역 없음', {
          lDongRegnCd: null,
          lDongSignguCd: null,
        }),
        cacheStatus: 'HIT',
      }),
      async getCachedQuery(request) {
        cacheCalls += 1;
        return { ...await request.fetchUpstream(), cacheStatus: 'REFRESHED' };
      },
    },
    relatedTourApiService: {
      searchRelatedPlacesByKeyword: async () => { relatedCalls += 1; },
    },
  });
  const result = await noRegion.getRelatedPlaces({ contentId: '100' });

  assert.deepEqual(result.items, []);
  assert.equal(cacheCalls, 1);
  assert.equal(relatedCalls, 0);
});

test('returns a fresh related cache without loading the origin detail', async () => {
  let detailCalls = 0;
  const cached = place('200', '캐시된 연관 장소');
  const service = createRelatedPlacesService({
    baseYm: '202503',
    placesService: {
      async getPlaceDetail() {
        detailCalls += 1;
        throw new Error('fresh cache에서는 호출되면 안 됩니다.');
      },
      async getCachedQuery(request) {
        assert.equal(request.operation, 'relatedPlaces');
        return {
          items: [cached],
          pagination: { pageNo: 1, numOfRows: 5, totalCount: 1 },
          cacheStatus: 'HIT',
        };
      },
    },
    relatedTourApiService: {},
  });

  const result = await service.getRelatedPlaces({ contentId: '100' });

  assert.equal(result.cacheStatus, 'HIT');
  assert.deepEqual(result.items, [cached]);
  assert.equal(detailCalls, 0);
});

test('can return a stale related cache when origin detail refresh fails', async () => {
  let relatedCalls = 0;
  const cached = place('200', '오래된 연관 장소');
  const service = createRelatedPlacesService({
    baseYm: '202503',
    placesService: {
      getPlaceDetail: async () => {
        throw new ExternalApiError('TourAPI 장애', {
          code: 'NETWORK_ERROR',
          service: 'tour',
          operation: 'placeDetail',
        });
      },
      async getCachedQuery(request) {
        try {
          await request.fetchUpstream();
        } catch (error) {
          assert.equal(error.code, 'NETWORK_ERROR');
          return {
            items: [cached],
            pagination: { pageNo: 1, numOfRows: 5, totalCount: 1 },
            cacheStatus: 'STALE',
          };
        }
        throw new Error('origin detail 오류가 전달되어야 합니다.');
      },
    },
    relatedTourApiService: {
      searchRelatedPlacesByKeyword: async () => {
        relatedCalls += 1;
      },
    },
  });

  const result = await service.getRelatedPlaces({ contentId: '100' });

  assert.equal(result.cacheStatus, 'STALE');
  assert.deepEqual(result.items, [cached]);
  assert.equal(relatedCalls, 0);
});

test('rejects non-numeric mapped IDs while accepting a later valid exact match', async () => {
  const origin = place('100', '가리봉시장');
  const service = createRelatedPlacesService({
    baseYm: '202503',
    placesService: {
      getPlaceDetail: async () => ({ item: origin, cacheStatus: 'HIT' }),
      async getCachedQuery(request) {
        return { ...await request.fetchUpstream(), cacheStatus: 'REFRESHED' };
      },
      searchPlacesByKeyword: async input => ({
        items: [
          place('not-numeric', input.keyword),
          place('200', input.keyword),
        ],
        pagination: {},
        cacheStatus: 'HIT',
      }),
    },
    relatedTourApiService: {
      searchRelatedPlacesByKeyword: async () => ({
        items: [relation(1, '정상 장소')],
        pagination: {},
      }),
    },
  });

  const result = await service.getRelatedPlaces({ contentId: '100' });

  assert.deepEqual(result.items.map(item => item.contentId), ['200']);
});

test('ignores relation rows that belong to a different source place', async () => {
  const origin = place('100', '가리봉시장');
  const searchCalls = [];
  const service = createRelatedPlacesService({
    baseYm: '202503',
    placesService: {
      getPlaceDetail: async () => ({ item: origin, cacheStatus: 'HIT' }),
      async getCachedQuery(request) {
        return { ...await request.fetchUpstream(), cacheStatus: 'REFRESHED' };
      },
      async searchPlacesByKeyword(input) {
        searchCalls.push(input);
        return {
          items: [place('200', input.keyword)],
          pagination: {},
          cacheStatus: 'HIT',
        };
      },
    },
    relatedTourApiService: {
      searchRelatedPlacesByKeyword: async () => ({
        items: [
          relation(1, '다른 출발지 결과', { sourceTitle: '남구로시장' }),
          relation(2, '정상 결과'),
        ],
        pagination: {},
      }),
    },
  });

  const result = await service.getRelatedPlaces({ contentId: '100' });

  assert.deepEqual(result.items.map(item => item.title), ['정상 결과']);
  assert.deepEqual(searchCalls.map(call => call.keyword), ['정상 결과']);
});

test('rejects an invalid configured related-tour month during construction', () => {
  assert.throws(
    () => createRelatedPlacesService({ baseYm: '202513' }),
    error => error.code === 'CONFIG_ERROR',
  );
});

test('rejects a non-numeric public contentId before any dependency call', async () => {
  let dependencyCalls = 0;
  const service = createRelatedPlacesService({
    baseYm: '202503',
    placesService: {
      getPlaceDetail: async () => { dependencyCalls += 1; },
    },
    relatedTourApiService: {},
  });

  await assert.rejects(
    service.getRelatedPlaces({ contentId: 'seed-id' }),
    error => error.code === 'VALIDATION_ERROR',
  );
  assert.equal(dependencyCalls, 0);
});
