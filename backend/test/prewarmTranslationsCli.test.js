'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { main, parseArgs, usage } = require('../scripts/prewarmTranslations');

test('parses bounded, explicit prewarm options', () => {
  assert.deepEqual(parseArgs(['--dry-run', '--limit=3', '--langs=en,ja', '--delay-ms=0']), {
    dryRun: true,
    help: false,
    limit: 3,
    delayMs: 0,
    langs: ['en', 'ja'],
  });
  assert.throws(() => parseArgs(['--limit=0']), /1 이상/);
  assert.throws(() => parseArgs(['--langs=ko,fr']), /지원하지 않는 언어/);
  assert.throws(() => parseArgs(['--unknown']), /지원하지 않는 인자/);
  assert.match(usage(), /--dry-run/);
});

// getPlaceDetail(mock)이 "저장했다"고 표시한 (contentId, lang) 조합만
// findPlace(mock)에서 cachedAt이 채워진 것으로 보인다 — 실제
// cachedPlacesService의 cacheStatus:REFRESHED가 항상 DB 저장을 보장하지는
// 않는다는 것을 흉내내기 위함이다(스크립트가 cacheStatus만 믿지 않고
// findPlace로 재확인하는지 검증하는 게 이 테스트 파일의 핵심이다).
function fakeRepository(places, { persistedStore = new Map() } = {}) {
  return {
    listPlacesPage: async ({ afterContentId, limit }) => {
      const startIndex = afterContentId
        ? places.findIndex(p => p.contentId === afterContentId) + 1
        : 0;
      const page = places.slice(startIndex, startIndex + limit);
      return {
        items: page,
        nextCursor: startIndex + limit < places.length
          ? page[page.length - 1]?.contentId ?? null
          : null,
      };
    },
    findPlace: async contentId => ({
      contentId,
      translations: {
        en: { cachedAt: persistedStore.get(`${contentId}:en`) ?? null },
        ja: { cachedAt: persistedStore.get(`${contentId}:ja`) ?? null },
        zh: { cachedAt: persistedStore.get(`${contentId}:zh`) ?? null },
      },
    }),
  };
}

test('only warms places that already have a Korean detail cached', async () => {
  const persistedStore = new Map();
  const repository = fakeRepository([
    { contentId: '1', detail: { title: '장소 1' } },
    { contentId: '2', detail: null }, // 국문 상세를 아직 조회한 적 없음 — 건너뛴다
    { contentId: '3', detail: { title: '장소 3' } },
  ], { persistedStore });
  const calls = [];
  const placesService = {
    getPlaceDetail: async ({ contentId, lang }) => {
      calls.push({ contentId, lang });
      persistedStore.set(`${contentId}:${lang}`, Date.now());
      return { cacheStatus: 'REFRESHED' };
    },
  };

  const summary = await main(['--langs=en', '--delay-ms=0'], { repository, placesService, logger: { warn() {} } });

  assert.deepEqual(calls.map(c => c.contentId), ['1', '3']);
  assert.equal(summary.scanned, 2);
  assert.equal(summary.warmed, 2);
  assert.equal(summary.skipped, 0);
  assert.equal(summary.unstable, 0);
  assert.equal(summary.failed, 0);
});

test('counts an existing fresh cache as skipped, not warmed, without calling the translation service', async () => {
  // 실측 근거: getPlaceDetail의 cacheStatus는 국문 상세 캐시 상태를
  // 반환할 뿐 번역 캐시 상태가 아니라서(cachedPlacesService.js 참고)
  // 믿을 수 없다 — 이미 번역이 캐시돼 있는지는 항상 findPlace로 직접
  // 확인해야 하고, 확인했으면 굳이 getPlaceDetail을 호출할 필요도 없다.
  const persistedStore = new Map([['1:en', Date.now()]]);
  const repository = fakeRepository([{ contentId: '1', detail: { title: '장소 1' } }], { persistedStore });
  let called = false;
  const placesService = {
    getPlaceDetail: async () => {
      called = true;
      return { cacheStatus: 'REFRESHED' };
    },
  };

  const summary = await main(['--langs=en', '--delay-ms=0'], { repository, placesService, logger: { warn() {} } });

  assert.equal(called, false);
  assert.equal(summary.warmed, 0);
  assert.equal(summary.skipped, 1);
});

test('counts a translation that never actually persisted as unstable, not warmed', async () => {
  // 실측 근거: cacheStatus가 'REFRESHED'로 와도, 그 번역이 재시도를 다
  // 쓰고도 여전히 불완전하면(cacheable:false) DB에는 아무것도 쓰이지
  // 않는다. cacheStatus만 보고 'warmed'로 세면 실제로는 캐시가 하나도
  // 안 채워졌는데 성공했다고 착각하게 된다.
  const repository = fakeRepository([{ contentId: '1', detail: { title: '장소 1' } }]);
  const placesService = {
    // REFRESHED라고 답하지만, 아무 persistedStore도 갱신하지 않는다 —
    // 즉 findPlace가 여전히 cachedAt: null을 돌려준다.
    getPlaceDetail: async () => ({ cacheStatus: 'REFRESHED' }),
  };
  const warnings = [];

  const summary = await main(
    ['--langs=en', '--delay-ms=0'],
    { repository, placesService, logger: { warn: (...args) => warnings.push(args) } },
  );

  assert.equal(summary.warmed, 0);
  assert.equal(summary.unstable, 1);
  assert.equal(warnings.length, 1);
});

test('counts a failed translation without stopping the rest of the run', async () => {
  const persistedStore = new Map();
  const repository = fakeRepository([
    { contentId: '1', detail: { title: '장소 1' } },
    { contentId: '2', detail: { title: '장소 2' } },
  ], { persistedStore });
  const warnings = [];
  const placesService = {
    getPlaceDetail: async ({ contentId, lang }) => {
      if (contentId === '1') throw new Error('일시적 실패');
      persistedStore.set(`${contentId}:${lang}`, Date.now());
      return { cacheStatus: 'REFRESHED' };
    },
  };

  const summary = await main(
    ['--langs=en', '--delay-ms=0'],
    { repository, placesService, logger: { warn: (...args) => warnings.push(args) } },
  );

  assert.equal(summary.failed, 1);
  assert.equal(summary.warmed, 1);
  assert.equal(warnings.length, 1);
});

test('dry-run counts targets without calling the translation service', async () => {
  const repository = fakeRepository([{ contentId: '1', detail: { title: '장소 1' } }]);
  let called = false;
  const placesService = {
    getPlaceDetail: async () => {
      called = true;
      return { cacheStatus: 'REFRESHED' };
    },
  };

  const summary = await main(
    ['--dry-run', '--langs=en,ja,zh'],
    { repository, placesService, logger: { warn() {} } },
  );

  assert.equal(called, false);
  assert.equal(summary.scanned, 1);
  assert.equal(summary.skipped, 3);
});

test('stops after --limit places regardless of how many pages that spans', async () => {
  const persistedStore = new Map();
  const repository = fakeRepository([
    { contentId: '1', detail: { title: '장소 1' } },
    { contentId: '2', detail: { title: '장소 2' } },
    { contentId: '3', detail: { title: '장소 3' } },
  ], { persistedStore });
  const calls = [];
  const placesService = {
    getPlaceDetail: async ({ contentId, lang }) => {
      calls.push(contentId);
      persistedStore.set(`${contentId}:${lang}`, Date.now());
      return { cacheStatus: 'REFRESHED' };
    },
  };

  const summary = await main(
    ['--limit=2', '--langs=en', '--delay-ms=0'],
    { repository, placesService, logger: { warn() {} } },
  );

  assert.equal(summary.scanned, 2);
  assert.deepEqual(calls, ['1', '2']);
});
