'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  createPlacesController,
  publicError,
} = require('../src/controllers/placesController');
const { ExternalApiError } = require('../src/utils/externalApiError');

function createResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    set(values) {
      Object.assign(this.headers, values);
      return this;
    },
    status(value) {
      this.statusCode = value;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    },
  };
}

function place(overrides = {}) {
  return {
    contentId: '1',
    contentTypeId: '14',
    title: '문학관',
    overview: null,
    areaCode: null,
    sigunguCode: null,
    lDongRegnCd: '48',
    lDongSignguCd: '220',
    regionName: '경상남도',
    address: null,
    latitude: null,
    longitude: null,
    tel: null,
    openTime: null,
    restDate: null,
    imageUrl: null,
    thumbnailUrl: null,
    lclsSystmCodes: ['VE'],
    cultures: ['문학'],
    category: '문학',
    source: 'TOUR_API',
    sourceUpdatedAt: null,
    ...overrides,
  };
}

test('routes keyword search and preserves the existing Flutter response shape', async () => {
  const calls = [];
  const controller = createPlacesController({
    tourApiService: {
      searchPlacesByKeyword: async options => {
        calls.push(options);
        return {
          items: [place()],
          pagination: { pageNo: 2, numOfRows: 10, totalCount: 31 },
          cacheStatus: 'HIT',
        };
      },
    },
  });
  const res = createResponse();

  await controller.searchPlaces({
    query: { q: '  문학관  ', pageNo: '2', numOfRows: '10' },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.ok(Array.isArray(res.body));
  assert.equal(res.body[0].address, '');
  assert.equal(res.body[0].tel, '');
  assert.equal(res.body[0].openTime, '');
  assert.equal(res.body[0].region, '경상남도');
  assert.deepEqual(res.headers, {
    'X-Cache-Status': 'HIT',
    'X-Page-No': 2,
    'X-Num-Of-Rows': 10,
    'X-Total-Count': 31,
  });
  assert.equal(calls[0].keyword, '문학관');
});

test('routes an empty keyword with a legal region to area listing', async () => {
  let received;
  const controller = createPlacesController({
    tourApiService: {
      getAreaBasedPlaces: async options => {
        received = options;
        return {
          items: [],
          pagination: { pageNo: 1, numOfRows: 20, totalCount: 0 },
        };
      },
    },
  });
  const res = createResponse();

  await controller.searchPlaces({
    query: { lDongRegnCd: '48', lDongSignguCd: '220' },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, []);
  assert.equal(received.lDongRegnCd, '48');
  assert.equal(received.lDongSignguCd, '220');
});

test('rejects missing and one-character searches without calling TourAPI', async () => {
  let calls = 0;
  const controller = createPlacesController({
    tourApiService: {
      searchPlacesByKeyword: async () => { calls += 1; },
      getAreaBasedPlaces: async () => { calls += 1; },
    },
  });

  for (const query of [{}, { q: '경' }]) {
    const res = createResponse();
    await controller.searchPlaces({ query }, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.code, 'VALIDATION_ERROR');
    assert.equal(res.body.retryable, false);
  }
  assert.equal(calls, 0);
});

test('filters the current page by culture without changing the internal model', async () => {
  const sourceItems = [
    place(),
    place({
      contentId: '2',
      title: '야외 음악 공연장',
      cultures: ['음악'],
      category: '음악',
    }),
  ];
  const controller = createPlacesController({
    tourApiService: {
      searchPlacesByKeyword: async () => ({
        items: sourceItems,
        pagination: { pageNo: 1, numOfRows: 20, totalCount: 100 },
      }),
    },
  });
  const res = createResponse();

  await controller.searchPlaces({ query: { q: '문화', culture: '문학' } }, res);

  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].contentId, '1');
  assert.equal(res.headers['X-Total-Count'], 1);
  assert.equal(sourceItems[0].address, null);
});

test('augments an area listing with a culture keyword search when q is absent', async () => {
  const calls = { areaBased: 0, keyword: [] };
  const controller = createPlacesController({
    tourApiService: {
      getAreaBasedPlaces: async () => {
        calls.areaBased += 1;
        return {
          items: [place({ contentId: '1', cultures: ['문학'], category: '문학' })],
          pagination: { pageNo: 1, numOfRows: 20, totalCount: 50 },
          cacheStatus: 'HIT',
        };
      },
      searchPlacesByKeyword: async options => {
        calls.keyword.push(options.keyword);
        return {
          items: [
            place({
              contentId: '2',
              title: '봄날 카페',
              lclsSystmCodes: ['FD', 'FD05'],
              cultures: ['커피·카페'],
              category: '커피·카페',
            }),
            place({ contentId: '1', cultures: ['문학'], category: '문학' }),
          ],
          pagination: { pageNo: 1, numOfRows: 20, totalCount: 3 },
          cacheStatus: 'REFRESHED',
        };
      },
    },
  });
  const res = createResponse();

  await controller.searchPlaces({
    query: { lDongRegnCd: '48', lDongSignguCd: '220', culture: '커피·카페' },
  }, res);

  assert.equal(calls.areaBased, 1);
  assert.deepEqual(calls.keyword, ['카페', '커피']);
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].contentId, '2');
  assert.equal(res.headers['X-Cache-Status'], 'REFRESHED');
});

test('allows culture-filtered search results and headers up to 50', async () => {
  const items = Array.from({ length: 25 }, (_, index) =>
    place({
      contentId: String(index + 1),
      title: `문학관 ${index + 1}`,
      cultures: ['문학'],
      category: '문학',
    }),
  );
  const controller = createPlacesController({
    tourApiService: {
      searchPlacesByKeyword: async () => ({
        items,
        pagination: { pageNo: 1, numOfRows: 50, totalCount: 25 },
        cacheStatus: 'HIT',
      }),
    },
  });
  const res = createResponse();

  await controller.searchPlaces({
    query: { q: '문학관', culture: '문학', numOfRows: '50' },
  }, res);

  assert.equal(res.body.length, 25);
  assert.equal(res.headers['X-Num-Of-Rows'], 50);
  assert.equal(res.headers['X-Total-Count'], 25);
});

test('rejects invalid culture-only pagination instead of silently clamping it', async () => {
  let calls = 0;
  const controller = createPlacesController({
    tourApiService: {
      getAreaBasedPlaces: async () => { calls += 1; },
      searchPlacesByKeyword: async () => { calls += 1; },
    },
  });
  const res = createResponse();

  await controller.searchPlaces({
    query: { lDongRegnCd: '48', culture: '문학', numOfRows: '51' },
  }, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, 'VALIDATION_ERROR');
  assert.equal(calls, 0);
});

test('marks the response STALE when the culture keyword search falls back to stale data', async () => {
  const controller = createPlacesController({
    tourApiService: {
      getAreaBasedPlaces: async () => ({
        items: [],
        pagination: { pageNo: 1, numOfRows: 20, totalCount: 0 },
        cacheStatus: 'HIT',
      }),
      searchPlacesByKeyword: async () => ({
        items: [place({
          contentId: '2',
          title: '바다 카페',
          lclsSystmCodes: ['FD', 'FD05'],
          cultures: ['커피·카페'],
          category: '커피·카페',
        })],
        pagination: { pageNo: 1, numOfRows: 20, totalCount: 1 },
        cacheStatus: 'STALE',
      }),
    },
  });
  const res = createResponse();

  await controller.searchPlaces({
    query: { lDongRegnCd: '48', culture: '커피·카페' },
  }, res);

  assert.equal(res.headers['X-Cache-Status'], 'STALE');
});

test('does not run a culture keyword search when q is already provided', async () => {
  let keywordCalls = 0;
  const controller = createPlacesController({
    tourApiService: {
      searchPlacesByKeyword: async () => {
        keywordCalls += 1;
        return {
          items: [place({ cultures: ['문학'], category: '문학' })],
          pagination: { pageNo: 1, numOfRows: 20, totalCount: 1 },
          cacheStatus: 'HIT',
        };
      },
      getAreaBasedPlaces: async () => {
        throw new Error('should not call area listing when q is present');
      },
    },
  });
  const res = createResponse();

  await controller.searchPlaces({
    query: { q: '문화', culture: '문학' },
  }, res);

  assert.equal(keywordCalls, 1);
  assert.equal(res.body.length, 1);
});

test('rejects an unsupported culture before calling the place service', async () => {
  let calls = 0;
  const controller = createPlacesController({
    tourApiService: {
      searchPlacesByKeyword: async () => { calls += 1; },
      getAreaBasedPlaces: async () => { calls += 1; },
    },
  });
  const res = createResponse();

  await controller.searchPlaces({
    query: { q: '문화', culture: '관광지' },
  }, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, 'VALIDATION_ERROR');
  assert.equal(calls, 0);
});

test('returns a compatible place detail and a structured 404', async () => {
  const foundController = createPlacesController({
    placesService: {
      getPlaceDetail: async () => ({
        item: place({ overview: '개요', images: [] }),
        cacheStatus: 'STALE',
      }),
    },
  });
  const found = createResponse();
  await foundController.getPlaceDetail({ params: { id: '1' } }, found);
  assert.equal(found.statusCode, 200);
  assert.equal(found.body.overview, '개요');
  assert.equal(found.body.address, '');
  assert.equal(found.headers['X-Cache-Status'], 'STALE');

  const missingController = createPlacesController({
    placesService: {
      getPlaceDetail: async () => ({
        item: null,
        cacheStatus: 'BYPASS',
      }),
    },
  });
  const missing = createResponse();
  await missingController.getPlaceDetail({ params: { id: '999' } }, missing);
  assert.equal(missing.statusCode, 404);
  assert.deepEqual(missing.body, {
    code: 'PLACE_NOT_FOUND',
    message: '장소를 찾을 수 없습니다.',
    retryable: false,
  });
  assert.equal(missing.headers['X-Cache-Status'], 'BYPASS');
});

test('caps a cached place detail gallery at ten public images', async () => {
  const images = Array.from({ length: 12 }, (_, index) => ({
    imageUrl: `https://example.com/${index + 1}.jpg`,
    thumbnailUrl: null,
    name: null,
    copyrightType: null,
    serialNumber: String(index + 1),
  }));
  const controller = createPlacesController({
    placesService: {
      getPlaceDetail: async () => ({
        item: place({ overview: '개요', images }),
        cacheStatus: 'HIT',
      }),
    },
  });
  const res = createResponse();

  await controller.getPlaceDetail({ params: { id: '1' } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.images.length, 10);
  assert.equal(res.body.images[9].serialNumber, '10');
});

test('returns related TourAPI place cards with cache status and a structured 404', async () => {
  const controller = createPlacesController({
    relatedPlacesService: {
      getRelatedPlaces: async () => ({
        items: [place({
          contentId: '2',
          title: '연관 장소',
          address: null,
        })],
        pagination: { pageNo: 1, numOfRows: 5, totalCount: 1 },
        cacheStatus: 'HIT',
      }),
    },
  });
  const found = createResponse();

  await controller.getRelatedPlaces({ params: { id: '1' } }, found);

  assert.equal(found.statusCode, 200);
  assert.equal(found.body[0].contentId, '2');
  assert.equal(found.body[0].address, '');
  assert.equal(found.headers['X-Cache-Status'], 'HIT');

  const missingController = createPlacesController({
    relatedPlacesService: {
      getRelatedPlaces: async () => null,
    },
  });
  const missing = createResponse();
  await missingController.getRelatedPlaces(
    { params: { id: '999' } },
    missing,
  );
  assert.equal(missing.statusCode, 404);
  assert.deepEqual(missing.body, {
    code: 'PLACE_NOT_FOUND',
    message: '장소를 찾을 수 없습니다.',
    retryable: false,
  });
});

test('maps internal external-api failures to stable public errors', () => {
  const cases = [
    ['VALIDATION_ERROR', 400, 'VALIDATION_ERROR', false],
    ['CONFIG_ERROR', 503, 'TOUR_API_UNAVAILABLE', false],
    ['TIMEOUT', 504, 'EXTERNAL_API_TIMEOUT', true],
    ['HTTP_ERROR', 502, 'EXTERNAL_API_ERROR', true],
  ];

  for (const [code, status, publicCode, retryable] of cases) {
    const result = publicError(new ExternalApiError('internal detail', {
      code,
      retryable,
    }));
    assert.equal(result.status, status);
    assert.equal(result.body.code, publicCode);
    assert.equal(result.body.retryable, retryable);
  }

  const unknown = publicError(new Error('secret internal message'));
  assert.equal(unknown.status, 500);
  assert.equal(unknown.body.code, 'INTERNAL_ERROR');
  assert.doesNotMatch(unknown.body.message, /secret/);
});
