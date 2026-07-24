'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  createRelatedTourApiService,
  normalizeRelatedCandidate,
} = require('../src/services/relatedTourApiService');

function rawCandidate(overrides = {}) {
  return {
    baseYm: '202503',
    tAtsCd: 'source-hash',
    tAtsNm: '가리봉시장',
    areaCd: '11',
    signguCd: '11530',
    rlteTatsCd: 'related-hash',
    rlteTatsNm: '서울드래곤시티',
    rlteRegnCd: '11',
    rlteRegnNm: '서울특별시',
    rlteSignguCd: '11170',
    rlteSignguNm: '용산구',
    rlteCtgryLclsNm: '숙박',
    rlteCtgryMclsNm: '호텔',
    rlteCtgrySclsNm: '관광호텔',
    rlteRank: '1',
    ...overrides,
  };
}

test('normalizes related-tour hashes, legal-district codes, and rank', () => {
  const item = normalizeRelatedCandidate(rawCandidate(), 'searchKeyword1');

  assert.deepEqual(item, {
    baseYm: '202503',
    sourceKey: 'source-hash',
    sourceTitle: '가리봉시장',
    sourceAreaCd: '11',
    sourceSignguCd: '11530',
    relatedKey: 'related-hash',
    title: '서울드래곤시티',
    relatedAreaCd: '11',
    relatedSignguCd: '11170',
    lDongRegnCd: '11',
    lDongSignguCd: '170',
    areaName: '서울특별시',
    signguName: '용산구',
    categoryLarge: '숙박',
    categoryMedium: '호텔',
    categorySmall: '관광호텔',
    rank: 1,
  });
});

test('calls keyword search with the verified default month and five candidates', async () => {
  const calls = [];
  const service = createRelatedTourApiService({
    baseYm: '202503',
    client: {
      async get(operation, options) {
        calls.push({ operation, options });
        return {
          items: [rawCandidate()],
          pagination: { pageNo: 1, numOfRows: 5, totalCount: 1 },
        };
      },
    },
  });

  const result = await service.searchRelatedPlacesByKeyword({
    areaCd: '11',
    signguCd: '11530',
    keyword: '  가리봉시장  ',
  });

  assert.equal(result.items[0].title, '서울드래곤시티');
  assert.deepEqual(calls, [{
    operation: 'searchKeyword1',
    options: {
      params: {
        baseYm: '202503',
        areaCd: '11',
        signguCd: '11530',
        keyword: '가리봉시장',
      },
      pageNo: 1,
      numOfRows: 5,
    },
  }]);
});

test('rejects malformed months, regions, keywords, and response rows', async () => {
  const service = createRelatedTourApiService({
    baseYm: '202503',
    client: { get: async () => ({ items: [] }) },
  });

  for (const input of [
    { baseYm: '202513', areaCd: '11', signguCd: '11530', keyword: '시장' },
    { areaCd: '1', signguCd: '11530', keyword: '시장' },
    { areaCd: '11', signguCd: '26500', keyword: '시장' },
    { areaCd: '11', signguCd: '11530', keyword: ' ' },
    {
      areaCd: '11',
      signguCd: '11530',
      keyword: '가'.repeat(101),
    },
  ]) {
    await assert.rejects(
      service.searchRelatedPlacesByKeyword(input),
      error => error.code === 'VALIDATION_ERROR',
    );
  }

  assert.throws(
    () => normalizeRelatedCandidate(
      rawCandidate({ rlteSignguCd: '99999' }),
      'searchKeyword1',
    ),
    error => error.code === 'INVALID_RESPONSE',
  );
});
