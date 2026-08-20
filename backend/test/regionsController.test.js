'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  createRegionsController,
} = require('../src/controllers/regionsController');
const { ExternalApiError } = require('../src/utils/externalApiError');

function response() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    set(values) {
      Object.assign(this.headers, values);
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test('returns the existing RegionItem body with a DataLab status header', async () => {
  const item = {
    areaCode: 'tongyeong',
    name: '통영',
    description: '박경리·청마 유치환의 흔적',
    spotCount: 9,
    score: 84,
  };
  const controller = createRegionsController({
    regionScoreService: {
      getRegionsByCulture: async cultureId => {
        assert.equal(cultureId, 2);
        return { items: [item], dataStatus: 'REFRESHED' };
      },
    },
  });
  const res = response();

  await controller.getRegionsByCulture({ params: { id: '2' } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['X-Region-Data-Status'], 'REFRESHED');
  assert.deepEqual(res.body, [item]);
});

test('preserves region 404 and handles unexpected controller failures', async () => {
  let calls = 0;
  const controller = createRegionsController({
    regionScoreService: {
      getRegionsByCulture: async () => {
        calls += 1;
        return null;
      },
    },
  });
  const invalid = response();
  await controller.getRegionsByCulture({ params: { id: '2abc' } }, invalid);
  assert.equal(invalid.statusCode, 404);
  assert.equal(calls, 0);

  const missing = response();
  await controller.getRegionsByCulture({ params: { id: '999' } }, missing);
  assert.equal(missing.statusCode, 404);
  assert.equal(calls, 1);

  const errors = [];
  const failed = createRegionsController({
    regionScoreService: {
      getRegionsByCulture: async () => {
        throw new Error('unexpected');
      },
    },
    logger: { error(message, detail) { errors.push({ message, detail }); } },
  });
  const failure = response();
  await failed.getRegionsByCulture({ params: { id: '2' } }, failure);
  assert.equal(failure.statusCode, 500);
  assert.deepEqual(failure.body, {
    message: '지역 정보를 불러올 수 없습니다.',
  });
  assert.equal(errors[0].detail.errorName, 'Error');
});

function tourPlace(overrides = {}) {
  return {
    contentId: '1',
    title: '박경리 문학관',
    address: null,
    tel: null,
    openTime: null,
    category: '문학',
    cultures: ['문학'],
    lclsSystmCodes: ['VE'],
    latitude: null,
    longitude: null,
    imageUrl: 'https://example.com/place.jpg',
    thumbnailUrl: 'https://example.com/place-thumb.jpg',
    ...overrides,
  };
}

test('merges region and keyword candidates, removes false positives, and ranks evidence', async () => {
  const calls = [];
  const controller = createRegionsController({
    placesService: {
      getAreaBasedPlaces: async options => {
        calls.push(['area', options]);
        return {
          items: [
            tourPlace({ contentId: '1', title: '작은 문학관' }),
            tourPlace({
              contentId: '2',
              title: '일반 기념관',
              lclsSystmCodes: ['NA'],
              cultures: [],
              category: '기타',
            }),
          ],
          cacheStatus: 'HIT',
        };
      },
      searchPlacesByKeyword: async options => {
        calls.push(['keyword', options]);
        return {
          items: [
            tourPlace({
              contentId: '3',
              title: '문화 공간',
              lclsSystmCodes: ['VE', 'VE06', 'VE060100'],
              cultures: ['음악'],
              category: '음악',
            }),
            tourPlace({ contentId: '1', title: '작은 문학관' }),
          ],
          cacheStatus: 'STALE',
        };
      },
    },
  });
  const res = response();

  await controller.getSpotsByRegion(
    { params: { code: 'tongyeong' }, query: { culture: '문학' } },
    res,
  );

  assert.deepEqual(res.body.map(item => item.contentId), ['1']);
  assert.equal(res.body[0].category, '문학');
  assert.equal(res.body[0].imageUrl, 'https://example.com/place.jpg');
  assert.equal(
    res.body[0].thumbnailUrl,
    'https://example.com/place-thumb.jpg',
  );
  assert.equal(res.headers['X-Cache-Status'], 'STALE');
  assert.equal(calls[0][1].lDongRegnCd, '48');
  assert.equal(calls[1][1].keyword, '문학관');
});

test('returns an honest empty culture result without synthetic seed places', async () => {
  const controller = createRegionsController({
    placesService: {
      getAreaBasedPlaces: async () => ({ items: [], cacheStatus: 'HIT' }),
      searchPlacesByKeyword: async () => ({
        items: [tourPlace({
          title: '음악분수',
          lclsSystmCodes: ['NA'],
          cultures: [],
          category: '기타',
        })],
        cacheStatus: 'HIT',
      }),
    },
  });
  const res = response();

  await controller.getSpotsByRegion(
    { params: { code: 'tongyeong' }, query: { culture: '음악' } },
    res,
  );

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, []);
});

test('rejects unsupported cultures before TourAPI calls', async () => {
  let calls = 0;
  const controller = createRegionsController({
    placesService: {
      getAreaBasedPlaces: async () => { calls += 1; },
      searchPlacesByKeyword: async () => { calls += 1; },
    },
  });
  const res = response();

  await controller.getSpotsByRegion(
    { params: { code: 'tongyeong' }, query: { culture: '관광지' } },
    res,
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, 'VALIDATION_ERROR');
  assert.equal(calls, 0);
});

test('returns structured external errors instead of synthetic culture fallback', async () => {
  const controller = createRegionsController({
    placesService: {
      getAreaBasedPlaces: async () => {
        throw new ExternalApiError('timed out', {
          code: 'TIMEOUT',
          retryable: true,
        });
      },
      searchPlacesByKeyword: async () => ({ items: [], cacheStatus: 'HIT' }),
    },
  });
  const res = response();

  await controller.getSpotsByRegion(
    { params: { code: 'tongyeong' }, query: { culture: '문학' } },
    res,
  );

  assert.equal(res.statusCode, 504);
  assert.deepEqual(res.body, {
    code: 'EXTERNAL_API_TIMEOUT',
    message: '관광정보 응답 시간이 초과되었습니다.',
    retryable: true,
  });
});

test('keeps the image contract when the unfiltered region request falls back', async () => {
  const controller = createRegionsController({
    placesService: {
      getAreaBasedPlaces: async () => {
        throw new Error('TourAPI unavailable');
      },
    },
  });
  const res = response();

  await controller.getSpotsByRegion(
    { params: { code: 'tongyeong' }, query: {} },
    res,
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.length > 0, true);
  assert.equal(Object.hasOwn(res.body[0], 'imageUrl'), true);
  assert.equal(Object.hasOwn(res.body[0], 'thumbnailUrl'), true);
  assert.equal(res.body[0].imageUrl, null);
  assert.equal(res.body[0].thumbnailUrl, null);
});
