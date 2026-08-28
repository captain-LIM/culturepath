'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  MAX_CANDIDATE_SERVICE_CALLS,
  createAiCandidateResolver,
} = require('../src/services/aiCandidateResolver');

function place(contentId, title, codes) {
  return {
    contentId,
    title,
    address: '통영시',
    lclsSystmCodes: codes,
  };
}

test('uses an official culture code query first and returns only verified numeric sources', async () => {
  const calls = [];
  const resolver = createAiCandidateResolver({
    logger: { warn() {} },
    placesService: {
      async getAreaBasedPlaces(input) {
        calls.push({ type: 'area', input });
        return {
          items: [place('100', '통영국제음악당', ['VE', 'VE06', 'VE060100'])],
          pagination: { pageNo: 1, numOfRows: 3, totalCount: 1 },
          cacheStatus: 'HIT',
        };
      },
      async searchPlacesByKeyword(input) {
        calls.push({ type: 'keyword', input });
        return { items: [], pagination: { pageNo: 1, numOfRows: 3, totalCount: 0 }, cacheStatus: 'HIT' };
      },
    },
  });
  const result = await resolver.resolve({ region: 'tongyeong', cultures: ['음악'], limit: 1 });
  assert.equal(calls[0].input.lclsSystm1, 'VE');
  assert.equal(calls[0].input.lclsSystm2, 'VE06');
  assert.equal(calls[0].input.lclsSystm3, 'VE060100');
  assert.equal(result.items[0].contentId, '100');
  assert.equal(result.items[0].trustedSource, true);
  assert.equal(result.cacheStatus, 'HIT');
});

test('widens an ambiguous culture with reviewed keywords and drops false positives', async () => {
  const keywords = [];
  const resolver = createAiCandidateResolver({
    logger: { warn() {} },
    placesService: {
      async getAreaBasedPlaces() {
        return { items: [], pagination: { pageNo: 1, numOfRows: 3, totalCount: 0 }, cacheStatus: 'HIT' };
      },
      async searchPlacesByKeyword(input) {
        keywords.push(input.keyword);
        return {
          items: input.keyword === '문학관'
            ? [
                place('200', '박경리기념관', ['VE']),
                place('201', '통영 바다 전망대', ['NA']),
              ]
            : [],
          pagination: { pageNo: 1, numOfRows: 3, totalCount: 2 },
          cacheStatus: 'REFRESHED',
        };
      },
    },
  });
  const result = await resolver.resolve({ region: 'tongyeong', cultures: ['문학'], limit: 3 });
  assert.ok(keywords.includes('문학관'));
  assert.deepEqual(result.items.map(item => item.contentId), ['200']);
});

test('rejects unsupported regions before any external candidate call', async () => {
  let called = false;
  const resolver = createAiCandidateResolver({
    placesService: {
      async getAreaBasedPlaces() { called = true; },
      async searchPlacesByKeyword() { called = true; },
    },
  });
  await assert.rejects(
    resolver.resolve({ region: 'unknown', cultures: ['문학'] }),
    /지원하지 않는 지역/,
  );
  assert.equal(called, false);
});

test('rehydrates prior session ids from MySQL and drops stale culture or region rows', async () => {
  let externalCalled = false;
  const resolver = createAiCandidateResolver({
    cacheRepository: {
      async findPlaces(ids) {
        assert.deepEqual(ids, ['100', '200', '300']);
        return [
          { summary: { ...place('100', '박경리기념관', ['VE']), lDongRegnCd: '48', lDongSignguCd: '220' } },
          { summary: { ...place('200', '통영 바다 전망대', ['NA']), lDongRegnCd: '48', lDongSignguCd: '220' } },
          { summary: { ...place('300', '다른 지역 문학관', ['VE']), lDongRegnCd: '51', lDongSignguCd: '150' } },
        ];
      },
    },
    placesService: {
      async getAreaBasedPlaces() { externalCalled = true; },
      async searchPlacesByKeyword() { externalCalled = true; },
    },
  });

  const result = await resolver.rehydrate({
    contentIds: ['100', '200', '300'],
    region: 'tongyeong',
    cultures: ['문학'],
    limit: 10,
  });

  assert.deepEqual(result.items.map(item => item.contentId), ['100']);
  assert.equal(result.cacheStatus, 'HIT');
  assert.equal(result.partial, true);
  assert.equal(externalCalled, false);
});

test('loads bounded trusted detail through the cache service for an explanation', async () => {
  const resolver = createAiCandidateResolver({
    placesService: {
      async getPlaceDetail(input) {
        assert.deepEqual(input, { contentId: '100' });
        return {
          item: {
            contentId: '100',
            overview: '문학 전시 공간',
            openTime: '09:00~18:00',
            restDate: '월요일',
            parking: '주차 가능',
            tel: '055-000-0000',
            homepage: 'https://example.com/',
          },
          cacheStatus: 'HIT',
        };
      },
    },
  });

  const result = await resolver.getDetail({ contentId: '100' });
  assert.equal(result.cacheStatus, 'HIT');
  assert.equal(result.item.overview, '문학 전시 공간');
  assert.equal(result.item.openTime, '09:00~18:00');
  await assert.rejects(resolver.getDetail({ contentId: 'not-tour' }), /contentId/);
});

test('bounds a cold multi-district search and rejects more than two cultures', async () => {
  let calls = 0;
  const empty = () => ({
    items: [],
    pagination: { pageNo: 1, numOfRows: 5, totalCount: 0 },
    cacheStatus: 'REFRESHED',
  });
  const resolver = createAiCandidateResolver({
    logger: { warn() {} },
    placesService: {
      async getAreaBasedPlaces() { calls += 1; return empty(); },
      async searchPlacesByKeyword() { calls += 1; return empty(); },
    },
  });

  const result = await resolver.resolve({
    region: 'jeonju',
    cultures: ['문학', '전통주·양조장'],
    limit: 10,
  });
  assert.ok(calls <= MAX_CANDIDATE_SERVICE_CALLS);
  assert.deepEqual(result.items, []);
  await assert.rejects(
    resolver.resolve({
      region: 'jeonju',
      cultures: ['문학', '음악', '공예·공방'],
      limit: 10,
    }),
    /최대 2개/,
  );
});

test('splits the cold-search budget fairly and preserves official candidates for both cultures', async () => {
  let calls = 0;
  const resolver = createAiCandidateResolver({
    logger: { warn() {} },
    placesService: {
      async getAreaBasedPlaces(input) {
        calls += 1;
        const isCoffee = input.lclsSystm2 === 'FD05';
        return {
          items: [isCoffee
            ? place('200', '전주 로스터리 카페', ['FD', 'FD05'])
            : place('100', '전주 음악 공연장', ['VE', 'VE06', 'VE060100'])],
          pagination: { pageNo: 1, numOfRows: 5, totalCount: 100 },
          cacheStatus: 'REFRESHED',
        };
      },
      async searchPlacesByKeyword() {
        calls += 1;
        return {
          items: [],
          pagination: { pageNo: 1, numOfRows: 5, totalCount: 100 },
          cacheStatus: 'REFRESHED',
        };
      },
    },
  });

  const result = await resolver.resolve({
    region: 'jeonju',
    cultures: ['음악', '커피·카페'],
    limit: 10,
  });

  assert.ok(calls <= MAX_CANDIDATE_SERVICE_CALLS);
  assert.deepEqual(result.items.map(item => item.contentId), ['100', '200']);
  assert.equal(result.partial, true);
});
