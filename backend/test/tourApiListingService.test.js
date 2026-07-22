'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createTourApiService } = require('../src/services/tourApiService');

function createRecordingClient(responseFactory) {
  const calls = [];
  return {
    calls,
    client: {
      get: async (operation, options) => {
        calls.push({ operation, options });
        return responseFactory(operation);
      },
    },
  };
}

function resultWith(items) {
  return {
    header: { resultCode: '0000', resultMsg: 'OK' },
    items,
    pagination: { pageNo: 1, numOfRows: 20, totalCount: items.length },
  };
}

test('loads and normalizes lclsSystmCode2 classifications', async () => {
  const fake = createRecordingClient(() =>
    resultWith([{ rnum: '1', code: 'AC', name: '숙박' }]),
  );
  const service = createTourApiService({ client: fake.client });

  const result = await service.getClassificationCodes({
    lclsSystm1: 'AC',
    pageNo: 2,
    numOfRows: 30,
  });

  assert.deepEqual(fake.calls, [
    {
      operation: 'lclsSystmCode2',
      options: {
        params: {
          lclsSystm1: 'AC',
          lclsSystm2: null,
          lclsSystm3: null,
        },
        pageNo: 2,
        numOfRows: 30,
      },
    },
  ]);
  assert.deepEqual(result.items, [{ code: 'AC', name: '숙박', rnum: 1 }]);
});

test('calls areaBasedList2 and maps all returned places', async () => {
  const fake = createRecordingClient(() =>
    resultWith([
      { contentid: '1', title: '첫 장소' },
      { contentid: '2', title: '두 번째 장소' },
    ]),
  );
  const normalized = [];
  const service = createTourApiService({
    client: fake.client,
    normalizePlace: (item, options) => {
      normalized.push({ item, options });
      return { contentId: item.contentid };
    },
  });

  const result = await service.getAreaBasedPlaces({
    lDongRegnCd: '48',
    lDongSignguCd: '220',
    contentTypeId: '14',
    lclsSystm1: 'VE',
    arrange: 'c',
  });

  assert.equal(fake.calls[0].operation, 'areaBasedList2');
  assert.deepEqual(fake.calls[0].options, {
    params: {
      lDongRegnCd: '48',
      lDongSignguCd: '220',
      contentTypeId: '14',
      lclsSystm1: 'VE',
      lclsSystm2: null,
      lclsSystm3: null,
      arrange: 'C',
    },
    pageNo: 1,
    numOfRows: 20,
  });
  assert.deepEqual(result.items, [{ contentId: '1' }, { contentId: '2' }]);
  assert.equal(normalized[0].options.operation, 'areaBasedList2');
});

test('calls searchKeyword2 with trimmed Korean keyword', async () => {
  const fake = createRecordingClient(() =>
    resultWith([{ contentid: '2390314', title: '한복남 경복궁점' }]),
  );
  const service = createTourApiService({ client: fake.client });

  const result = await service.searchPlacesByKeyword({
    keyword: '  경복궁  ',
    lDongRegnCd: '11',
    lDongSignguCd: '110',
    contentTypeId: '12',
    numOfRows: 50,
  });

  assert.equal(fake.calls[0].operation, 'searchKeyword2');
  assert.equal(fake.calls[0].options.params.keyword, '경복궁');
  assert.equal(fake.calls[0].options.params.lDongRegnCd, '11');
  assert.equal(fake.calls[0].options.params.lDongSignguCd, '110');
  assert.equal(fake.calls[0].options.numOfRows, 50);
  assert.equal(result.items[0].contentId, '2390314');
});

test('validates required values, sort options, code shapes, and pagination', async t => {
  const fake = createRecordingClient(() => resultWith([]));
  const service = createTourApiService({ client: fake.client });

  await t.test('lDongRegnCd is required for area listing', async () => {
    await assert.rejects(
      service.getAreaBasedPlaces(),
      error => error.code === 'VALIDATION_ERROR',
    );
  });
  await t.test('keyword is required and limited to 100 characters', async () => {
    await assert.rejects(
      service.searchPlacesByKeyword({ keyword: ' ' }),
      error => error.code === 'VALIDATION_ERROR',
    );
    await assert.rejects(
      service.searchPlacesByKeyword({ keyword: '가'.repeat(101) }),
      error => error.code === 'VALIDATION_ERROR',
    );
  });
  await t.test('legal-district sigungu requires its region', async () => {
    await assert.rejects(
      service.searchPlacesByKeyword({
        keyword: '경복궁',
        lDongSignguCd: '110',
      }),
      error => error.code === 'VALIDATION_ERROR',
    );
  });
  await t.test('only title, modified, and created sort options are accepted', async () => {
    await assert.rejects(
      service.getAreaBasedPlaces({ lDongRegnCd: '48', arrange: 'E' }),
      error => error.code === 'VALIDATION_ERROR',
    );
  });
  await t.test('legal-district codes have exact shapes and pages contain at most 50 rows', async () => {
    await assert.rejects(
      service.getAreaBasedPlaces({ lDongRegnCd: '360' }),
      error => error.code === 'VALIDATION_ERROR',
    );
    await assert.rejects(
      service.getAreaBasedPlaces({ lDongRegnCd: '48', numOfRows: 51 }),
      error => error.code === 'VALIDATION_ERROR',
    );
  });
  await t.test('classification depth requires parents and matching prefixes', async () => {
    await assert.rejects(
      service.getClassificationCodes({ lclsSystm2: 'VE01' }),
      error => error.code === 'VALIDATION_ERROR',
    );
    await assert.rejects(
      service.getAreaBasedPlaces({
        lDongRegnCd: '48',
        lclsSystm1: 'VE',
        lclsSystm2: 'FD01',
      }),
      error => error.code === 'VALIDATION_ERROR',
    );
    await assert.rejects(
      service.searchPlacesByKeyword({
        keyword: '문학관',
        lclsSystm3: 'VE010100',
      }),
      error => error.code === 'VALIDATION_ERROR',
    );
    await assert.rejects(
      service.getClassificationCodes({ lclsSystm1: 'garbage' }),
      error => error.code === 'VALIDATION_ERROR',
    );
  });

  assert.equal(fake.calls.length, 0);
});
