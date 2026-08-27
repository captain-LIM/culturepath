'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  createRegionsController: createProductionRegionsController,
} = require('../src/controllers/regionsController');
const { ExternalApiError } = require('../src/utils/externalApiError');

const emptyPlaceUsageRepository = Object.freeze({
  async findPublicCourseCounts() {
    return new Map();
  },
});

function createRegionsController(options = {}) {
  return createProductionRegionsController({
    placeUsageRepository: emptyPlaceUsageRepository,
    ...options,
  });
}

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
    // 실시간 장소 수 조회가 실패하면 큐레이션 수치를 그대로 유지해야 한다.
    placesService: {
      getAreaBasedPlaces: async () => { throw new Error('TourAPI down'); },
      searchPlacesByKeyword: async () => { throw new Error('TourAPI down'); },
    },
    logger: { warn() {}, error() {} },
  });
  const res = response();

  await controller.getRegionsByCulture({ params: { id: '2' } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['X-Region-Data-Status'], 'REFRESHED');
  assert.deepEqual(res.body, [item]);
});

test('overrides the curated spotCount with the live matching count', async () => {
  const item = {
    areaCode: 'seoul',
    name: '서울',
    description: '홍대·연남·망원 동네 책방 밀집지',
    spotCount: 12,
    score: 80,
  };
  const controller = createRegionsController({
    regionScoreService: {
      getRegionsByCulture: async () => ({ items: [item], dataStatus: 'HIT' }),
    },
    placesService: {
      getAreaBasedPlaces: async () => ({
        items: [
          tourPlace({ contentId: '1', title: '독립서점 위트앤시니컬', lclsSystmCodes: [] }),
          tourPlace({ contentId: '2', title: '소수책방', lclsSystmCodes: [] }),
        ],
        pagination: { pageNo: 1, numOfRows: 50, totalCount: 2 },
        cacheStatus: 'HIT',
      }),
      searchPlacesByKeyword: async () => ({
        items: [],
        pagination: { pageNo: 1, numOfRows: 50, totalCount: 0 },
        cacheStatus: 'HIT',
      }),
    },
  });
  const res = response();

  await controller.getRegionsByCulture({ params: { id: '1' } }, res);

  assert.equal(res.body[0].spotCount, 2);
  assert.notEqual(res.body[0].spotCount, item.spotCount);
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
  assert.equal(res.headers['X-Page-No'], 1);
  assert.equal(res.headers['X-Num-Of-Rows'], 20);
  assert.equal(calls[0][1].lDongRegnCd, '48');
  assert.equal(calls[1][1].keyword, '문학관');
  assert.equal(calls[2][1].keyword, '문학');
});

test('does not cap culture results at 20 and follows pagination for more matches', async () => {
  const areaCalls = [];
  const controller = createRegionsController({
    placesService: {
      getAreaBasedPlaces: async options => {
        areaCalls.push(options.pageNo);
        const start = (options.pageNo - 1) * 50;
        const count = options.pageNo === 1 ? 50 : 20;
        const items = Array.from({ length: count }, (_, index) =>
          tourPlace({
            contentId: String(start + index + 1),
            title: `문학관 ${start + index + 1}`,
          }),
        );
        return {
          items,
          pagination: { pageNo: options.pageNo, numOfRows: 50, totalCount: 70 },
          cacheStatus: 'HIT',
        };
      },
      searchPlacesByKeyword: async () => ({
        items: [],
        pagination: { pageNo: 1, numOfRows: 50, totalCount: 0 },
        cacheStatus: 'HIT',
      }),
    },
  });
  const res = response();

  await controller.getSpotsByRegion(
    { params: { code: 'tongyeong' }, query: { culture: '문학' } },
    res,
  );

  assert.deepEqual(areaCalls, [1, 2]);
  assert.equal(res.body.length, 70);
});

test('adds distinct public-course usage counts without changing place order', async () => {
  const requestedIds = [];
  const controller = createRegionsController({
    placesService: {
      getAreaBasedPlaces: async () => ({
        items: [
          tourPlace({ contentId: '1', title: '첫 번째 문학관' }),
          tourPlace({ contentId: '2', title: '두 번째 문학관' }),
        ],
        cacheStatus: 'HIT',
      }),
      searchPlacesByKeyword: async () => ({ items: [], cacheStatus: 'HIT' }),
    },
    placeUsageRepository: {
      async findPublicCourseCounts(contentIds) {
        requestedIds.push(...contentIds);
        return new Map([['1', 2]]);
      },
    },
  });
  const res = response();

  await controller.getSpotsByRegion(
    { params: { code: 'tongyeong' }, query: { culture: '문학' } },
    res,
  );

  assert.deepEqual(requestedIds, ['1', '2']);
  assert.deepEqual(res.body.map(item => item.contentId), ['1', '2']);
  assert.deepEqual(res.body.map(item => item.publicCourseCount), [2, 0]);
});

test('keeps place results available with null usage when usage aggregation fails', async () => {
  const warnings = [];
  const controller = createRegionsController({
    placesService: {
      getAreaBasedPlaces: async () => ({
        items: [tourPlace({ contentId: '1' })],
        cacheStatus: 'HIT',
      }),
      searchPlacesByKeyword: async () => ({ items: [], cacheStatus: 'HIT' }),
    },
    placeUsageRepository: {
      async findPublicCourseCounts() {
        throw new Error('database unavailable');
      },
    },
    logger: {
      warn(message, detail) {
        warnings.push({ message, detail });
      },
    },
  });
  const res = response();

  await controller.getSpotsByRegion(
    { params: { code: 'tongyeong' }, query: { culture: '문학' } },
    res,
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body[0].publicCourseCount, null);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].detail.errorName, 'Error');
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

test('returns a partial culture response when at least one candidate source succeeds', async () => {
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

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, []);
});

test('returns structured external errors when every culture candidate source fails', async () => {
  const controller = createRegionsController({
    placesService: {
      getAreaBasedPlaces: async () => {
        throw new ExternalApiError('timed out', {
          code: 'TIMEOUT',
          retryable: true,
        });
      },
      searchPlacesByKeyword: async () => {
        throw new ExternalApiError('timed out', {
          code: 'TIMEOUT',
          retryable: true,
        });
      },
    },
    logger: null,
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

test('supports up to 50 region spots and publishes next-page headers', async () => {
  const received = [];
  const items = Array.from({ length: 50 }, (_, index) => tourPlace({
    contentId: String(index + 1),
    title: `문학관 ${index + 1}`,
  }));
  const controller = createRegionsController({
    placesService: {
      getAreaBasedPlaces: async options => {
        received.push(options);
        return {
          items,
          pagination: { pageNo: 1, numOfRows: 50, totalCount: 80 },
          cacheStatus: 'HIT',
        };
      },
      searchPlacesByKeyword: async options => {
        received.push(options);
        return {
          items: [],
          pagination: { pageNo: 1, numOfRows: 50, totalCount: 0 },
          cacheStatus: 'HIT',
        };
      },
    },
  });
  const res = response();

  await controller.getSpotsByRegion({
    params: { code: 'tongyeong' },
    query: { culture: '문학', pageNo: '1', numOfRows: '50' },
  }, res);

  assert.equal(res.body.length, 50);
  assert.equal(res.headers['X-Has-More'], 'true');
  assert.equal(res.headers['X-Next-Page'], 2);
  assert.equal(received[0].numOfRows, 50);
});

test('combines both Jeonju districts without widening the request to Jeonbuk', async () => {
  const calls = [];
  const controller = createRegionsController({
    placesService: {
      getAreaBasedPlaces: async options => {
        calls.push(['area', options]);
        return {
          items: [tourPlace({
            contentId: options.lDongSignguCd,
            title: `${options.lDongSignguCd} 공방`,
            lclsSystmCodes: ['EX', 'EX02'],
            cultures: ['공예·공방'],
            category: '공예·공방',
          })],
          pagination: { pageNo: 1, numOfRows: 20, totalCount: 1 },
          cacheStatus: 'HIT',
        };
      },
      searchPlacesByKeyword: async options => {
        calls.push(['keyword', options]);
        return {
          items: [],
          pagination: { pageNo: 1, numOfRows: 20, totalCount: 0 },
          cacheStatus: 'HIT',
        };
      },
    },
  });
  const res = response();

  await controller.getSpotsByRegion({
    params: { code: 'jeonju' },
    query: { culture: '공예·공방' },
  }, res);

  assert.deepEqual(res.body.map(item => item.contentId), ['111', '113']);
  assert.deepEqual(
    [...new Set(calls.map(([, options]) => options.lDongSignguCd))].sort(),
    ['111', '113'],
  );
  assert.equal(calls.every(([, options]) => options.lDongRegnCd === '52'), true);
});

test('rejects invalid region spot pagination before candidate calls', async () => {
  let calls = 0;
  const controller = createRegionsController({
    placesService: {
      getAreaBasedPlaces: async () => { calls += 1; },
      searchPlacesByKeyword: async () => { calls += 1; },
    },
  });
  const res = response();

  await controller.getSpotsByRegion({
    params: { code: 'tongyeong' },
    query: { culture: '문학', numOfRows: '51' },
  }, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, 'VALIDATION_ERROR');
  assert.equal(calls, 0);
});

test('rejects region pages above the bounded cumulative-fetch window', async () => {
  let calls = 0;
  const controller = createRegionsController({
    placesService: {
      getAreaBasedPlaces: async () => { calls += 1; },
      searchPlacesByKeyword: async () => { calls += 1; },
    },
  });
  const res = response();

  await controller.getSpotsByRegion({
    params: { code: 'tongyeong' },
    query: { culture: '문학', pageNo: '6' },
  }, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, 'VALIDATION_ERROR');
  assert.equal(calls, 0);
});

test('does not advertise a sixth region page at the cumulative-fetch boundary', async () => {
  let callIndex = 0;
  const controller = createRegionsController({
    placesService: {
      getAreaBasedPlaces: async options => ({
        items: [tourPlace({
          contentId: `area-${++callIndex}`,
          title: `문학관 ${callIndex}`,
        })],
        pagination: { ...options, totalCount: 100 },
        cacheStatus: 'HIT',
      }),
      searchPlacesByKeyword: async options => ({
        items: [tourPlace({
          contentId: `keyword-${++callIndex}`,
          title: `문학관 ${callIndex}`,
        })],
        pagination: { ...options, totalCount: 100 },
        cacheStatus: 'HIT',
      }),
    },
  });
  const res = response();

  await controller.getSpotsByRegion({
    params: { code: 'tongyeong' },
    query: { culture: '문학', pageNo: '5', numOfRows: '1' },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['X-Has-More'], 'false');
  assert.equal(Object.hasOwn(res.headers, 'X-Next-Page'), false);
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

test('paginates the unfiltered seed fallback without repeating page one', async () => {
  const controller = createRegionsController({
    placesService: {
      getAreaBasedPlaces: async () => {
        throw new Error('TourAPI unavailable');
      },
    },
  });
  const res = response();

  await controller.getSpotsByRegion({
    params: { code: 'tongyeong' },
    query: { pageNo: '2', numOfRows: '2' },
  }, res);

  assert.equal(res.body.length, 2);
  assert.equal(res.body[0].contentId, 'ty003');
  assert.equal(res.headers['X-Has-More'], 'true');
  assert.equal(res.headers['X-Next-Page'], 3);
});
