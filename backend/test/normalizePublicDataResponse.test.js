'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  PAGINATION_METADATA,
  normalizeItems,
  normalizePublicDataResponse,
} = require('../src/utils/normalizePublicDataResponse');

test('normalizeItems handles arrays, one item, and empty item variants', () => {
  const first = { code: '1', name: '서울' };
  const second = { code: '2', name: '인천' };

  assert.deepEqual(normalizeItems({ item: [first, second] }), [first, second]);
  assert.deepEqual(normalizeItems({ item: first }), [first]);

  for (const emptyValue of [undefined, null, '', {}, { item: '' }, { item: {} }]) {
    assert.deepEqual(normalizeItems(emptyValue), []);
  }
});

test('normalizes a successful public data response', () => {
  const result = normalizePublicDataResponse({
    response: {
      header: { resultCode: '0000', resultMsg: 'OK' },
      body: {
        items: { item: { code: '1', name: '서울' } },
        pageNo: 1,
        numOfRows: 10,
        totalCount: 17,
      },
    },
  });

  assert.deepEqual(result, {
    header: { resultCode: '0000', resultMsg: 'OK' },
    items: [{ code: '1', name: '서울' }],
    pagination: { pageNo: 1, numOfRows: 10, totalCount: 17 },
  });
  assert.deepEqual(result.pagination[PAGINATION_METADATA], {
    pageNoProvided: true,
    pageNoValid: true,
    numOfRowsProvided: true,
    numOfRowsValid: true,
    totalCountProvided: true,
    totalCountValid: true,
  });
  assert.equal(
    JSON.stringify(result.pagination),
    '{"pageNo":1,"numOfRows":10,"totalCount":17}',
  );
});

test('rejects business errors in normal and gateway error envelopes', () => {
  assert.throws(
    () =>
      normalizePublicDataResponse({
        response: {
          header: { resultCode: '11', resultMsg: '필수 파라미터 누락' },
          body: {},
        },
      }),
    error => error.code === 'BUSINESS_ERROR' && error.resultCode === '11',
  );

  assert.throws(
    () =>
      normalizePublicDataResponse({
        OpenAPI_ServiceResponse: {
          cmmMsgHeader: {
            errMsg: 'SERVICE ERROR',
            returnAuthMsg: 'SERVICE_KEY_IS_NOT_REGISTERED_ERROR',
            returnReasonCode: '30',
          },
        },
      }),
    error => error.code === 'BUSINESS_ERROR' && error.resultCode === '30',
  );
});
