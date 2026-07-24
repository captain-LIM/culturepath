'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  createDataLabService,
  normalizeVisitorItem,
  normalizeVisitorRequest,
} = require('../src/services/dataLabService');
const {
  normalizePublicDataResponse,
} = require('../src/utils/normalizePublicDataResponse');

function rawVisitor(overrides = {}) {
  return {
    signguCode: '48220',
    signguNm: '통영시',
    daywkDivCd: '4',
    daywkDivNm: '목요일',
    touDivCd: '2',
    touDivNm: '외지인(b)',
    touNum: '317425.5',
    baseYmd: '20210513',
    ...overrides,
  };
}

test('normalizes metropolitan and local visitor rows without truncating decimals', () => {
  const local = normalizeVisitorItem(
    rawVisitor(),
    'local',
    'locgoRegnVisitrDDList',
  );
  const metropolitan = normalizeVisitorItem(
    rawVisitor({
      signguCode: undefined,
      signguNm: undefined,
      areaCode: '48',
      areaNm: '경상남도',
    }),
    'metropolitan',
    'metcoRegnVisitrDDList',
  );

  assert.deepEqual(local, {
    level: 'local',
    code: '48220',
    name: '통영시',
    dayOfWeekCode: '4',
    dayOfWeekName: '목요일',
    visitorTypeCode: '2',
    visitorTypeName: '외지인(b)',
    visitorCount: 317425.5,
    baseYmd: '20210513',
  });
  assert.equal(metropolitan.code, '48');
  assert.equal(metropolitan.name, '경상남도');
  assert.equal(metropolitan.visitorCount, 317425.5);
});

test('validates real calendar dates, date order, and page bounds', () => {
  assert.deepEqual(
    normalizeVisitorRequest(
      {
        startYmd: '20240229',
        endYmd: '20240229',
        pageNo: '2',
        numOfRows: '1000',
      },
      'locgoRegnVisitrDDList',
    ),
    {
      startYmd: '20240229',
      endYmd: '20240229',
      pageNo: 2,
      numOfRows: 1000,
    },
  );

  for (const input of [
    { startYmd: '20210229', endYmd: '20210301' },
    { startYmd: '20210514', endYmd: '20210513' },
    { startYmd: '20210513', endYmd: '20210513', pageNo: 0 },
    { startYmd: '20210513', endYmd: '20210513', numOfRows: 1001 },
  ]) {
    assert.throws(
      () => normalizeVisitorRequest(input, 'locgoRegnVisitrDDList'),
      error => error.code === 'VALIDATION_ERROR',
    );
  }
});

test('collects every advertised DataLab page with a fixed call ceiling', async () => {
  const calls = [];
  const service = createDataLabService({
    maxPages: 2,
    client: {
      async get(operation, options) {
        calls.push({ operation, options });
        const pageNo = options.pageNo;
        return {
          header: { resultCode: '0000', resultMsg: 'OK' },
          items: Array.from(
            { length: pageNo === 1 ? 1000 : 500 },
            (_, index) => {
              const rowNumber = ((pageNo - 1) * 1000) + index;
              return rawVisitor({
                signguCode: String(10000 + rowNumber),
                signguNm: `지역 ${rowNumber}`,
              });
            },
          ),
          pagination: {
            pageNo,
            numOfRows: 1000,
            totalCount: 1500,
          },
        };
      },
    },
  });

  const result = await service.getAllLocalVisitors({
    startYmd: '20210513',
    endYmd: '20210513',
  });

  assert.equal(result.items.length, 1500);
  assert.equal(result.items[0].code, '10000');
  assert.equal(result.items[1000].code, '11000');
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map(call => call.options.pageNo), [1, 2]);
  assert.ok(calls.every(call =>
    call.operation === 'locgoRegnVisitrDDList' &&
    call.options.numOfRows === 1000,
  ));

  const limited = createDataLabService({
    maxPages: 1,
    client: {
      get: async () => ({
        items: Array.from({ length: 1000 }, (_, index) => rawVisitor({
          signguCode: String(13000 + index),
          signguNm: `지역 ${index}`,
        })),
        pagination: { pageNo: 1, numOfRows: 1000, totalCount: 1001 },
      }),
    },
  });
  await assert.rejects(
    limited.getAllLocalVisitors({
      startYmd: '20210513',
      endYmd: '20210513',
    }),
    error => error.code === 'RESPONSE_LIMIT',
  );
});

test('rejects invalid totals and incomplete advertised pagination', async () => {
  for (const responseFactory of [
    () => ({
      items: [rawVisitor()],
      pagination: { pageNo: 1, numOfRows: 1000, totalCount: 'invalid' },
    }),
    ({ pageNo }) => ({
      items: [rawVisitor()],
      pagination: { pageNo, numOfRows: 1000, totalCount: 1001 },
    }),
  ]) {
    const service = createDataLabService({
      maxPages: 2,
      client: {
        get: async (_operation, { pageNo }) => responseFactory({ pageNo }),
      },
    });
    await assert.rejects(
      service.getAllLocalVisitors({
        startYmd: '20210513',
        endYmd: '20210513',
      }),
      error => error.code === 'INVALID_RESPONSE',
    );
  }
});

test('uses the API response page size and rejects inconsistent page metadata', async () => {
  const calls = [];
  const service = createDataLabService({
    maxPages: 2,
    client: {
      async get(_operation, { pageNo }) {
        calls.push(pageNo);
        return {
          items: Array.from({ length: 10 }, (_, index) => rawVisitor({
            signguCode: String(11000 + ((pageNo - 1) * 10) + index),
            signguNm: `지역 ${pageNo}-${index}`,
          })),
          pagination: { pageNo, numOfRows: 10, totalCount: 20 },
        };
      },
    },
  });

  const result = await service.getAllLocalVisitors({
    startYmd: '20210513',
    endYmd: '20210513',
  });

  assert.equal(result.items.length, 20);
  assert.equal(result.pagination.numOfRows, 10);
  assert.deepEqual(calls, [1, 2]);

  for (const paginationForPage of [
    pageNo => ({ pageNo: pageNo === 2 ? 1 : pageNo, numOfRows: 10, totalCount: 20 }),
    pageNo => ({ pageNo, numOfRows: pageNo === 2 ? 5 : 10, totalCount: 20 }),
    pageNo => ({ pageNo, numOfRows: 10, totalCount: pageNo === 2 ? 21 : 20 }),
  ]) {
    const inconsistent = createDataLabService({
      maxPages: 2,
      client: {
        async get(_operation, { pageNo }) {
          return {
            items: Array.from({ length: 10 }, (_, index) => rawVisitor({
              signguCode: String(12000 + ((pageNo - 1) * 10) + index),
              signguNm: `지역 ${pageNo}-${index}`,
            })),
            pagination: paginationForPage(pageNo),
          };
        },
      },
    });
    await assert.rejects(
      inconsistent.getAllLocalVisitors({
        startYmd: '20210513',
        endYmd: '20210513',
      }),
      error => error.code === 'INVALID_RESPONSE',
    );
  }
});

test('rejects missing upstream pagination fields and duplicate visitor rows', async () => {
  const missingMetadata = createDataLabService({
    client: {
      async get() {
        return normalizePublicDataResponse({
          response: {
            header: { resultCode: '0000', resultMsg: 'OK' },
            body: {
              items: { item: [rawVisitor()] },
            },
          },
        });
      },
    },
  });
  await assert.rejects(
    missingMetadata.getAllLocalVisitors({
      startYmd: '20210513',
      endYmd: '20210513',
    }),
    error => error.code === 'INVALID_RESPONSE',
  );

  for (const totalCount of ['invalid', null, '', '   ']) {
    const invalidMetadata = createDataLabService({
      client: {
        async get() {
          return normalizePublicDataResponse({
            response: {
              header: { resultCode: '0000', resultMsg: 'OK' },
              body: {
                items: { item: [rawVisitor()] },
                pageNo: 1,
                numOfRows: 1,
                totalCount,
              },
            },
          });
        },
      },
    });
    await assert.rejects(
      invalidMetadata.getAllLocalVisitors({
        startYmd: '20210513',
        endYmd: '20210513',
      }),
      error => error.code === 'INVALID_RESPONSE',
    );
  }

  const duplicateRows = createDataLabService({
    client: {
      async get() {
        return {
          items: [rawVisitor(), rawVisitor()],
          pagination: { pageNo: 1, numOfRows: 10, totalCount: 2 },
        };
      },
    },
  });
  await assert.rejects(
    duplicateRows.getAllLocalVisitors({
      startYmd: '20210513',
      endYmd: '20210513',
    }),
    error => error.code === 'INVALID_RESPONSE',
  );
});

test('rejects malformed codes, visitor types, dates, and visitor counts', () => {
  for (const overrides of [
    { signguCode: '4822' },
    { signguNm: ' ' },
    { daywkDivCd: '8' },
    { touDivCd: '4' },
    { touNum: '-1' },
    { touNum: 'not-a-number' },
    { touNum: undefined },
    { touNum: null },
    { touNum: '' },
    { touNum: '   ' },
    { baseYmd: '20210229' },
  ]) {
    assert.throws(
      () => normalizeVisitorItem(
        rawVisitor(overrides),
        'local',
        'locgoRegnVisitrDDList',
      ),
      error => error.code === 'INVALID_RESPONSE',
    );
  }
});
