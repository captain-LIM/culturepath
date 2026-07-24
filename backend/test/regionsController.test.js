'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  createRegionsController,
  getSpotsByRegion,
} = require('../src/controllers/regionsController');

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

test('keeps the existing region spot seed route outside the R4 score change', async () => {
  const res = response();

  await getSpotsByRegion(
    { params: { code: 'tongyeong' }, query: { culture: '문학' } },
    res,
  );

  assert.ok(Array.isArray(res.body));
  assert.ok(res.body.some(item => item.title === '박경리기념관'));
});
