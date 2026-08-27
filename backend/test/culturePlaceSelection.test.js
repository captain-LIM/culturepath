'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  collectAreaPlacePage,
  collectCulturePlacePage,
  combineCultureCacheStatus,
  isSupportedCulture,
  selectPlacesForCulture,
} = require('../src/services/culturePlaceSelection');

function place(contentId, title, lclsSystmCodes = []) {
  return {
    contentId,
    title,
    lclsSystmCodes,
    cultures: [],
    category: '기타',
  };
}

test('keeps only evidence-backed culture matches and ranks official codes first', () => {
  const result = selectPlacesForCulture([
    [
      place('1', '작은 미술관'),
      place('2', '오션뷰', ['VE', 'VE07', 'VE070600']),
      place('3', '미술 이야기가 있는 해변', ['NA']),
    ],
  ], '미술·갤러리');

  assert.deepEqual(result.map(item => item.contentId), ['2', '1']);
  assert.deepEqual(result[0].cultures, ['미술·갤러리']);
  assert.equal(result[0].category, '미술·갤러리');
});

test('deduplicates by contentId and keeps the stronger duplicate in first-seen position', () => {
  const result = selectPlacesForCulture([
    [
      place('1', '동네 카페'),
      place('2', '오래된 카페'),
    ],
    [
      place('1', '동네 쉼터', ['FD', 'FD05']),
      place('3', '바다 카페'),
    ],
  ], '커피·카페');

  assert.deepEqual(result.map(item => item.contentId), ['1', '2', '3']);
  assert.equal(result[0].title, '동네 쉼터');
});

test('preserves discovery order for equal evidence and enforces the result limit', () => {
  const result = selectPlacesForCulture([
    [
      place('3', '셋째 문학관'),
      place('1', '첫째 문학관'),
      place('2', '둘째 문학관'),
    ],
  ], '문학', { limit: 2 });

  assert.deepEqual(result.map(item => item.contentId), ['3', '1']);

  const oversized = Array.from({ length: 25 }, (_, index) =>
    place(String(index + 1), `문학관 ${index + 1}`),
  );
  assert.equal(
    selectPlacesForCulture([oversized], '문학', { limit: 50 }).length,
    25,
  );
});

test('allows only evidence-backed cross-class matches found in live TourAPI data', () => {
  const result = selectPlacesForCulture([[
    place('1', '군산 작은 책방', ['AC', 'AC06', 'AC060200']),
    place('2', '인생서점 북페어', ['EV', 'EV03', 'EV030400']),
    place('3', '명인안동소주', ['EX', 'EX06', 'EX060800']),
    place('4', '안동소주전통음식박물관', ['VE', 'VE07', 'VE070100']),
  ]], '독립서점·책방');

  assert.deepEqual(result.map(item => item.contentId), ['1']);
  assert.deepEqual(
    selectPlacesForCulture([[
      place('3', '명인안동소주', ['EX', 'EX06', 'EX060800']),
      place('4', '안동소주전통음식박물관', ['VE', 'VE07', 'VE070100']),
    ]], '전통주·양조장').map(item => item.contentId),
    ['3', '4'],
  );
});

test('activates supplemental keywords only until the first culture page is full', async () => {
  const keywordCalls = [];
  const result = await collectCulturePlacePage({
    culture: '음악',
    request: { pageNo: 1, numOfRows: 2 },
    limit: 2,
    logger: null,
    placesService: {
      getAreaBasedPlaces: async () => ({ items: [], cacheStatus: 'HIT' }),
      searchPlacesByKeyword: async ({ keyword }) => {
        keywordCalls.push(keyword);
        return {
          items: keyword === '음악당'
            ? [place('1', '통영국제음악당'), place('2', '작은 음악당')]
            : [],
          cacheStatus: 'REFRESHED',
        };
      },
    },
  });

  assert.deepEqual(keywordCalls, ['공연장', '음악당']);
  assert.deepEqual(result.items.map(item => item.contentId), ['1', '2']);
  assert.equal(result.cacheStatus, 'REFRESHED');
  assert.equal(result.hasMore, false);
});

test('keeps multi-district area pagination stable across cumulative pages', async () => {
  const calls = [];
  const placesService = {
    getAreaBasedPlaces: async options => {
      calls.push(`${options.pageNo}:${options.lDongSignguCd}`);
      return {
        items: [place(
          `${options.pageNo}-${options.lDongSignguCd}`,
          `문학관 ${options.pageNo}-${options.lDongSignguCd}`,
        )],
        pagination: { ...options, totalCount: 2 },
        cacheStatus: 'HIT',
      };
    },
  };

  const result = await collectAreaPlacePage({
    placesService,
    requests: [
      { lDongRegnCd: '52', lDongSignguCd: '111' },
      { lDongRegnCd: '52', lDongSignguCd: '113' },
    ],
    pagination: { pageNo: 2, numOfRows: 1 },
    logger: null,
  });

  assert.deepEqual(calls, ['1:111', '1:113', '2:111', '2:113']);
  assert.deepEqual(result.items.map(item => item.contentId), ['1-113']);
  assert.equal(result.hasMore, true);
});

test('keeps earlier culture pages stable when later upstream pages have stronger matches', async () => {
  const placesService = {
    getAreaBasedPlaces: async options => ({
      items: options.pageNo === 1
        ? [place('title-1', '첫 카페'), place('title-2', '둘 카페')]
        : [
            place('official-1', '셋', ['FD', 'FD05']),
            place('official-2', '넷', ['FD', 'FD05']),
          ],
      pagination: { ...options, totalCount: 4 },
      cacheStatus: 'HIT',
    }),
    searchPlacesByKeyword: async options => ({
      items: [],
      pagination: { ...options, totalCount: 0 },
      cacheStatus: 'HIT',
    }),
  };

  const first = await collectCulturePlacePage({
    placesService,
    culture: '커피·카페',
    request: { pageNo: 1, numOfRows: 2 },
    limit: 2,
    logger: null,
  });
  const second = await collectCulturePlacePage({
    placesService,
    culture: '커피·카페',
    request: { pageNo: 2, numOfRows: 2 },
    limit: 2,
    logger: null,
  });

  assert.deepEqual(first.items.map(item => item.contentId), ['title-1', 'title-2']);
  assert.deepEqual(second.items.map(item => item.contentId), ['official-1', 'official-2']);
  assert.equal(second.hasMore, false);
});

test('tops up below-floor culture pages using relaxed classification without reintroducing franchise noise', async () => {
  const placesService = {
    getAreaBasedPlaces: async () => ({
      items: [
        place('1', '독립서점 하나'),
        place('2', '헌책방 둘'),
        // FD(음식) top-level로 분류돼 엄격 기준에서는 빠지지만, 부족할 때
        // relaxed로 다시 채워질 후보.
        place('3', '책방카페 셋', ['FD', 'FD05']),
        // 프랜차이즈 지점명은 relaxed에서도 절대 채워지면 안 된다.
        place('4', '이마트 넷점'),
      ],
      pagination: { pageNo: 1, numOfRows: 5, totalCount: 4 },
      cacheStatus: 'HIT',
    }),
    searchPlacesByKeyword: async () => ({
      items: [],
      pagination: { pageNo: 1, numOfRows: 5, totalCount: 0 },
      cacheStatus: 'HIT',
    }),
  };

  const result = await collectCulturePlacePage({
    placesService,
    culture: '독립서점·책방',
    request: { pageNo: 1, numOfRows: 5 },
    limit: 5,
    logger: null,
  });

  assert.deepEqual(result.items.map(item => item.contentId), ['1', '2', '3']);
});

test('returns partial culture candidates but throws when every source fails', async () => {
  const timeout = new Error('timeout');
  const partial = await collectCulturePlacePage({
    culture: '문학',
    request: { pageNo: 1, numOfRows: 1 },
    limit: 1,
    logger: null,
    placesService: {
      getAreaBasedPlaces: async () => { throw timeout; },
      searchPlacesByKeyword: async () => ({
        items: [place('1', '김동명문학관')],
        cacheStatus: 'HIT',
      }),
    },
  });
  assert.equal(partial.partial, true);
  assert.equal(partial.items.length, 1);

  await assert.rejects(
    collectCulturePlacePage({
      culture: '문학',
      request: { pageNo: 1, numOfRows: 1 },
      limit: 1,
      logger: null,
      placesService: {
        getAreaBasedPlaces: async () => { throw timeout; },
        searchPlacesByKeyword: async () => { throw timeout; },
      },
    }),
    error => error === timeout,
  );
});

test('rejects unsupported cultures and combines cache status conservatively', () => {
  assert.equal(isSupportedCulture('문학'), true);
  assert.equal(isSupportedCulture('관광지'), false);
  assert.throws(
    () => selectPlacesForCulture([[]], '관광지'),
    /지원하지 않는 문화/,
  );
  assert.equal(combineCultureCacheStatus('HIT', 'REFRESHED'), 'REFRESHED');
  assert.equal(combineCultureCacheStatus('REFRESHED', 'BYPASS'), 'BYPASS');
  assert.equal(combineCultureCacheStatus('HIT', 'BYPASS'), 'BYPASS');
  assert.equal(combineCultureCacheStatus('HIT', 'STALE'), 'STALE');
  assert.equal(combineCultureCacheStatus(undefined, 'BYPASS'), 'BYPASS');
});
