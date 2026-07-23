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
  const sourceItems = [place(), place({ contentId: '2', cultures: ['음악'], category: '음악' })];
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

test('returns a compatible place detail and a structured 404', async () => {
  const foundController = createPlacesController({
    tourApiService: { getPlaceDetail: async () => place({ overview: '개요', images: [] }) },
  });
  const found = createResponse();
  await foundController.getPlaceDetail({ params: { id: '1' } }, found);
  assert.equal(found.statusCode, 200);
  assert.equal(found.body.overview, '개요');
  assert.equal(found.body.address, '');

  const missingController = createPlacesController({
    tourApiService: { getPlaceDetail: async () => null },
  });
  const missing = createResponse();
  await missingController.getPlaceDetail({ params: { id: '999' } }, missing);
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
