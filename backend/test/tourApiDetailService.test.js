'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createTourApiService } = require('../src/services/tourApiService');
const { ExternalApiError } = require('../src/utils/externalApiError');

function createRecordingClient(responses = {}) {
  const calls = [];
  return {
    calls,
    client: {
      get: async (operation, options) => {
        calls.push({ operation, options });
        const response = responses[operation];
        return typeof response === 'function'
          ? response(options)
          : response || resultWith([]);
      },
    },
  };
}

function resultWith(items, pagination = {}) {
  return {
    header: { resultCode: '0000', resultMsg: 'OK' },
    items,
    pagination: {
      pageNo: pagination.pageNo ?? 1,
      numOfRows: pagination.numOfRows ?? 20,
      totalCount: pagination.totalCount ?? items.length,
    },
  };
}

test('normalizes top-level and child legal-district codes', async () => {
  const top = createRecordingClient({
    ldongCode2: resultWith([{ rnum: '1', code: '48', name: '경상남도' }]),
  });
  const topService = createTourApiService({ client: top.client });

  const topResult = await topService.getLegalDistrictCodes();
  assert.deepEqual(top.calls[0], {
    operation: 'ldongCode2',
    options: {
      params: { lDongRegnCd: null, lDongListYn: 'N' },
      pageNo: 1,
      numOfRows: 20,
    },
  });
  assert.deepEqual(topResult.items[0], {
    lDongRegnCd: '48',
    lDongRegnNm: '경상남도',
    lDongSignguCd: null,
    lDongSignguNm: null,
    rnum: 1,
  });

  const child = createRecordingClient({
    ldongCode2: resultWith([
      {
        rnum: 1,
        code: '220',
        name: '통영시',
      },
    ]),
  });
  const childResult = await createTourApiService({ client: child.client })
    .getLegalDistrictCodes({ lDongRegnCd: '48' });

  assert.equal(child.calls[0].options.params.lDongRegnCd, '48');
  assert.deepEqual(childResult.items[0], {
    lDongRegnCd: '48',
    lDongRegnNm: null,
    lDongSignguCd: '220',
    lDongSignguNm: '통영시',
    rnum: 1,
  });
});

test('rejects mismatched or malformed common-detail identifiers as upstream data', async () => {
  const invalidItems = [
    { contentid: '2', contenttypeid: '12', title: '다른 장소' },
    { contentid: 'bad-id', contenttypeid: '12', title: '잘못된 장소' },
    { contentid: '1', contenttypeid: 'bad-type', title: '잘못된 유형' },
  ];

  for (const commonItem of invalidItems) {
    const fake = createRecordingClient({
      detailCommon2: resultWith([commonItem]),
    });
    const service = createTourApiService({ client: fake.client });

    await assert.rejects(
      service.getPlaceDetail({ contentId: '1' }),
      error => error.code === 'INVALID_RESPONSE',
    );
    assert.deepEqual(
      fake.calls.map(call => call.operation),
      ['detailCommon2'],
    );
  }
});

test('fails the whole detail when a required child detail request fails', async () => {
  const fake = createRecordingClient({
    detailCommon2: resultWith([
      { contentid: '1', contenttypeid: '12', title: '관광지' },
    ]),
    detailIntro2: resultWith([]),
    detailImage2: () => {
      throw new ExternalApiError('image failed', {
        code: 'TIMEOUT',
        service: 'tour',
        operation: 'detailImage2',
        retryable: true,
      });
    },
  });

  await assert.rejects(
    createTourApiService({ client: fake.client }).getPlaceDetail({ contentId: '1' }),
    error => error.code === 'TIMEOUT',
  );
});

test('calls each detail operation with only current parameters', async () => {
  const fake = createRecordingClient();
  const service = createTourApiService({ client: fake.client });

  await service.getCommonDetail({ contentId: '2390314' });
  await service.getIntroDetail({ contentId: '2390314', contentTypeId: '12' });
  await service.getInfoDetail({
    contentId: '2390314',
    contentTypeId: '12',
    numOfRows: 30,
  });
  await service.getDetailImages({
    contentId: '2390314',
    imageYN: 'y',
    numOfRows: 10,
  });

  assert.deepEqual(fake.calls, [
    {
      operation: 'detailCommon2',
      options: {
        params: { contentId: '2390314' },
        pageNo: 1,
        numOfRows: 1,
      },
    },
    {
      operation: 'detailIntro2',
      options: {
        params: { contentId: '2390314', contentTypeId: '12' },
        pageNo: 1,
        numOfRows: 1,
      },
    },
    {
      operation: 'detailInfo2',
      options: {
        params: { contentId: '2390314', contentTypeId: '12' },
        pageNo: 1,
        numOfRows: 30,
      },
    },
    {
      operation: 'detailImage2',
      options: {
        params: { contentId: '2390314', imageYN: 'Y' },
        pageNo: 1,
        numOfRows: 10,
      },
    },
  ]);
});

test('assembles common, intro, and images without calling detailInfo by default', async () => {
  const fake = createRecordingClient({
    detailCommon2: resultWith([
      { contentid: '2390314', contenttypeid: '12', title: '경복궁' },
    ]),
    detailIntro2: resultWith([{ usetime: '09:00~18:00' }]),
    detailImage2: resultWith([{ originimgurl: 'https://example.com/1.jpg' }]),
  });
  let normalized;
  const service = createTourApiService({
    client: fake.client,
    normalizePlaceDetail: (payload, options) => {
      normalized = { payload, options };
      return { contentId: payload.commonItem.contentid };
    },
  });

  const result = await service.getPlaceDetail({ contentId: '2390314' });

  assert.deepEqual(result, { contentId: '2390314' });
  assert.deepEqual(
    fake.calls.map(call => call.operation),
    ['detailCommon2', 'detailIntro2', 'detailImage2'],
  );
  assert.equal(normalized.payload.introItem.usetime, '09:00~18:00');
  assert.equal(normalized.payload.imageItems.length, 1);
  assert.deepEqual(normalized.payload.infoItems, []);
});

test('supports optional detailInfo and stops when the common detail is empty', async () => {
  const withInfo = createRecordingClient({
    detailCommon2: resultWith([
      { contentid: '1', contenttypeid: '14', title: '문화시설' },
    ]),
    detailIntro2: resultWith([]),
    detailImage2: resultWith([]),
    detailInfo2: resultWith([{ infoname: '이용 안내', infotext: '안내' }]),
  });
  await createTourApiService({
    client: withInfo.client,
    normalizePlaceDetail: payload => payload,
  }).getPlaceDetail({ contentId: '1', includeInfo: true });
  assert.ok(withInfo.calls.some(call => call.operation === 'detailInfo2'));

  const empty = createRecordingClient({ detailCommon2: resultWith([]) });
  const result = await createTourApiService({ client: empty.client })
    .getPlaceDetail({ contentId: '1' });
  assert.equal(result, null);
  assert.deepEqual(empty.calls.map(call => call.operation), ['detailCommon2']);
});

test('rejects invalid legal codes and detail parameters before a request', async () => {
  const fake = createRecordingClient();
  const service = createTourApiService({ client: fake.client });

  await assert.rejects(
    service.getLegalDistrictCodes({ lDongRegnCd: '480' }),
    error => error.code === 'VALIDATION_ERROR',
  );
  assert.throws(
    () => service.getCommonDetail({ contentId: 'mock-id' }),
    error => error.code === 'VALIDATION_ERROR',
  );
  assert.throws(
    () => service.getIntroDetail({ contentId: '1' }),
    error => error.code === 'VALIDATION_ERROR',
  );
  assert.throws(
    () => service.getDetailImages({ contentId: '1', imageYN: 'all' }),
    error => error.code === 'VALIDATION_ERROR',
  );
  assert.equal(fake.calls.length, 0);
});
