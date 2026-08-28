'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  CACHE_STATUS,
  canonicalQuery,
  createCachedPlacesService,
  createQueryCacheKey,
} = require('../src/services/cachedPlacesService');
const { ExternalApiError } = require('../src/utils/externalApiError');

const CONFIG = Object.freeze({
  enabled: true,
  ttlMs: 1_000,
  staleMaxAgeMs: 5_000,
  dbFailureCooldownMs: 500,
});

function place(contentId = '1') {
  return {
    contentId,
    contentTypeId: '14',
    title: `장소 ${contentId}`,
    cultures: ['문학'],
  };
}

function result(items = [place()]) {
  return {
    items,
    pagination: { pageNo: 1, numOfRows: 20, totalCount: items.length },
  };
}

function createLogger() {
  const warnings = [];
  return {
    warnings,
    logger: { warn(message, detail) { warnings.push({ message, detail }); } },
  };
}

test('canonicalizes equivalent query options to one secret-free cache key', () => {
  const first = canonicalQuery('searchKeyword2', {
    keyword: '  문학  ',
    arrange: 'a',
  });
  const second = canonicalQuery('searchKeyword2', {
    keyword: '문학',
    arrange: 'A',
    pageNo: '1',
    numOfRows: 20,
  });

  assert.deepEqual(first, second);
  assert.equal(createQueryCacheKey(first), createQueryCacheKey(second));
  assert.doesNotMatch(JSON.stringify(first), /serviceKey|TOUR_API_KEY/);
});

test('returns a fresh query cache without calling TourAPI', async () => {
  let upstreamCalls = 0;
  const cached = result([place('2')]);
  const service = createCachedPlacesService({
    config: CONFIG,
    clock: () => 10_000,
    repository: {
      findQuery: async () => ({
        ...cached,
        cachedAt: 9_000,
        expiresAt: 11_000,
      }),
    },
    tourApiService: {
      searchPlacesByKeyword: async () => {
        upstreamCalls += 1;
        return result();
      },
    },
  });

  const response = await service.searchPlacesByKeyword({ keyword: '문학' });

  assert.equal(response.cacheStatus, CACHE_STATUS.HIT);
  assert.equal(response.items[0].contentId, '2');
  assert.equal(upstreamCalls, 0);
});

test('reuses the generic query cache for a related-place operation', async () => {
  let fetchCalls = 0;
  const service = createCachedPlacesService({
    config: CONFIG,
    clock: () => 10_000,
    repository: {
      findQuery: async () => ({
        ...result([place('7')]),
        cachedAt: 9_000,
        expiresAt: 11_000,
      }),
    },
    tourApiService: {},
  });

  const response = await service.getCachedQuery({
    operation: 'relatedPlaces',
    input: { baseYm: '202503', contentId: '100' },
    fetchUpstream: async () => {
      fetchCalls += 1;
      return result();
    },
  });

  assert.equal(response.cacheStatus, CACHE_STATUS.HIT);
  assert.equal(response.items[0].contentId, '7');
  assert.equal(fetchCalls, 0);
  await assert.rejects(
    service.getCachedQuery({
      operation: 'invalid-operation',
      fetchUpstream: async () => result(),
    }),
    /operation/,
  );
});

test('validates empty query options before reading a warm cache', async () => {
  let cacheReads = 0;
  let upstreamCalls = 0;
  const service = createCachedPlacesService({
    config: CONFIG,
    clock: () => 10_000,
    repository: {
      findQuery: async () => {
        cacheReads += 1;
        return {
          ...result(),
          cachedAt: 9_000,
          expiresAt: 11_000,
        };
      },
    },
    tourApiService: {
      searchPlacesByKeyword: async () => {
        upstreamCalls += 1;
        return result();
      },
    },
  });

  for (const invalid of [
    { pageNo: '' },
    { numOfRows: '' },
    { arrange: '' },
  ]) {
    await assert.rejects(
      service.searchPlacesByKeyword({ keyword: '문학', ...invalid }),
      error => error.code === 'VALIDATION_ERROR',
    );
  }

  assert.equal(cacheReads, 0);
  assert.equal(upstreamCalls, 0);
});

test('refreshes and stores a query cache miss', async () => {
  let saved;
  const service = createCachedPlacesService({
    config: CONFIG,
    clock: () => 10_000,
    repository: {
      findQuery: async () => null,
      saveQuery: async input => { saved = input; },
    },
    tourApiService: {
      getAreaBasedPlaces: async () => result([place('3')]),
    },
  });

  const response = await service.getAreaBasedPlaces({
    lDongRegnCd: '48',
  });

  assert.equal(response.cacheStatus, CACHE_STATUS.REFRESHED);
  assert.equal(saved.operation, 'areaBasedList2');
  assert.equal(saved.items[0].contentId, '3');
  assert.equal(saved.cachedAt.getTime(), 10_000);
  assert.equal(saved.expiresAt.getTime(), 11_000);
  assert.match(saved.cacheKey, /^[a-f0-9]{64}$/);
});

test('returns stale query data for upstream errors except validation errors', async () => {
  const cached = {
    ...result([place('4')]),
    cachedAt: 7_000,
    expiresAt: 8_000,
  };
  const logger = createLogger();
  const repository = { findQuery: async () => cached };
  const timeoutService = createCachedPlacesService({
    config: CONFIG,
    clock: () => 10_000,
    logger: logger.logger,
    repository,
    tourApiService: {
      searchPlacesByKeyword: async () => {
        throw new ExternalApiError('timeout', {
          code: 'TIMEOUT',
          retryable: true,
        });
      },
    },
  });

  const response = await timeoutService.searchPlacesByKeyword({
    keyword: '문학',
  });
  assert.equal(response.cacheStatus, CACHE_STATUS.STALE);
  assert.equal(response.items[0].contentId, '4');
  assert.equal(logger.warnings.length, 1);
  assert.doesNotMatch(JSON.stringify(logger.warnings), /timeout/);

  const validationService = createCachedPlacesService({
    config: CONFIG,
    clock: () => 10_000,
    logger: logger.logger,
    repository,
    tourApiService: {
      searchPlacesByKeyword: async () => {
        throw new ExternalApiError('invalid', {
          code: 'VALIDATION_ERROR',
        });
      },
    },
  });
  await assert.rejects(
    validationService.searchPlacesByKeyword({ keyword: '' }),
    error => error.code === 'VALIDATION_ERROR',
  );
});

test('rejects an upstream error when stale data is older than the maximum age', async () => {
  const service = createCachedPlacesService({
    config: CONFIG,
    clock: () => 10_000,
    repository: {
      findQuery: async () => ({
        ...result(),
        cachedAt: 4_000,
        expiresAt: 5_000,
      }),
    },
    tourApiService: {
      searchPlacesByKeyword: async () => {
        throw new ExternalApiError('timeout', { code: 'TIMEOUT' });
      },
    },
  });

  await assert.rejects(
    service.searchPlacesByKeyword({ keyword: '문학' }),
    error => error.code === 'TIMEOUT',
  );
});

test('bypasses a failed DB and observes the failure cooldown', async () => {
  let reads = 0;
  let upstreamCalls = 0;
  let timestamp = 10_000;
  const logger = createLogger();
  const service = createCachedPlacesService({
    config: CONFIG,
    clock: () => timestamp,
    logger: logger.logger,
    repository: {
      findQuery: async () => {
        reads += 1;
        throw new Error('password and host must not leak');
      },
      saveQuery: async () => {
        throw new Error('must not write during cooldown');
      },
    },
    tourApiService: {
      searchPlacesByKeyword: async () => {
        upstreamCalls += 1;
        return result();
      },
    },
  });

  const first = await service.searchPlacesByKeyword({ keyword: '문학' });
  timestamp += 100;
  const second = await service.searchPlacesByKeyword({ keyword: '역사' });

  assert.equal(first.cacheStatus, CACHE_STATUS.BYPASS);
  assert.equal(second.cacheStatus, CACHE_STATUS.BYPASS);
  assert.equal(reads, 1);
  assert.equal(upstreamCalls, 2);
  assert.equal(logger.warnings.length, 1);
  assert.doesNotMatch(JSON.stringify(logger.warnings), /password|host/);
});

test('coalesces concurrent misses for the same key but not different keys', async () => {
  let upstreamCalls = 0;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const service = createCachedPlacesService({
    config: { ...CONFIG, enabled: false },
    clock: () => 10_000,
    repository: {},
    tourApiService: {
      searchPlacesByKeyword: async ({ keyword }) => {
        upstreamCalls += 1;
        await gate;
        return result([place(keyword)]);
      },
    },
  });

  const sameA = service.searchPlacesByKeyword({ keyword: '문학' });
  const sameB = service.searchPlacesByKeyword({ keyword: '문학' });
  const different = service.searchPlacesByKeyword({ keyword: '역사' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(upstreamCalls, 2);
  release();

  const [first, second, third] = await Promise.all([sameA, sameB, different]);
  assert.equal(first.items[0].contentId, '문학');
  assert.equal(second.items[0].contentId, '문학');
  assert.equal(third.items[0].contentId, '역사');
});

test('returns and refreshes detail caches using the wrapper contract', async () => {
  let upstreamCalls = 0;
  let saved;
  let cached = {
    detail: place('1'),
    detailCachedAt: 9_000,
    detailExpiresAt: 11_000,
  };
  const repository = {
    findPlace: async () => cached,
    saveDetail: async input => { saved = input; },
  };
  const service = createCachedPlacesService({
    config: CONFIG,
    clock: () => 10_000,
    repository,
    tourApiService: {
      getPlaceDetail: async () => {
        upstreamCalls += 1;
        return place('2');
      },
    },
  });

  const hit = await service.getPlaceDetail({ contentId: '1' });
  assert.equal(hit.cacheStatus, CACHE_STATUS.HIT);
  assert.equal(hit.item.contentId, '1');
  assert.equal(upstreamCalls, 0);

  cached = null;
  const refreshed = await service.getPlaceDetail({ contentId: '2' });
  assert.equal(refreshed.cacheStatus, CACHE_STATUS.REFRESHED);
  assert.equal(saved.item.contentId, '2');
  assert.equal(upstreamCalls, 1);
});

test('does not negative-cache a missing detail', async () => {
  let writes = 0;
  const service = createCachedPlacesService({
    config: CONFIG,
    clock: () => 10_000,
    repository: {
      findPlace: async () => null,
      saveDetail: async () => { writes += 1; },
    },
    tourApiService: {
      getPlaceDetail: async () => null,
    },
  });

  const response = await service.getPlaceDetail({ contentId: '999' });

  assert.equal(response.item, null);
  assert.equal(response.cacheStatus, CACHE_STATUS.BYPASS);
  assert.equal(writes, 0);
});

test('uses stale detail on TourAPI failure and never hides invalid contentId', async () => {
  let repositoryCalls = 0;
  const repository = {
    findPlace: async () => {
      repositoryCalls += 1;
      return {
        detail: place('1'),
        detailCachedAt: 7_000,
        detailExpiresAt: 8_000,
      };
    },
  };
  const service = createCachedPlacesService({
    config: CONFIG,
    clock: () => 10_000,
    repository,
    tourApiService: {
      getPlaceDetail: async ({ contentId }) => {
        throw new ExternalApiError(`invalid ${contentId}`, {
          code: contentId === 'bad' ? 'VALIDATION_ERROR' : 'TIMEOUT',
        });
      },
    },
    logger: { warn() {} },
  });

  const stale = await service.getPlaceDetail({ contentId: '1' });
  assert.equal(stale.cacheStatus, CACHE_STATUS.STALE);

  await assert.rejects(
    service.getPlaceDetail({ contentId: 'bad' }),
    error => error.code === 'VALIDATION_ERROR',
  );
  assert.equal(repositoryCalls, 1);
});

test('reports BYPASS when a cache write fails without losing upstream data', async () => {
  const logger = createLogger();
  const service = createCachedPlacesService({
    config: CONFIG,
    clock: () => 10_000,
    logger: logger.logger,
    repository: {
      findQuery: async () => null,
      saveQuery: async () => {
        throw new Error('write failed');
      },
    },
    tourApiService: {
      searchPlacesByKeyword: async () => result([place('5')]),
    },
  });

  const response = await service.searchPlacesByKeyword({ keyword: '문학' });

  assert.equal(response.cacheStatus, CACHE_STATUS.BYPASS);
  assert.equal(response.items[0].contentId, '5');
  assert.equal(logger.warnings.length, 1);
});

test('translation overlay matches the nearby candidate whose title overlaps, not just the nearest neighbor', async () => {
  const korItem = {
    contentId: '129784',
    title: '강릉 오죽헌·시립박물관',
    latitude: 37.7791389,
    longitude: 128.8796621,
  };
  let searchArgs;
  const service = createCachedPlacesService({
    config: CONFIG,
    clock: () => 10_000,
    repository: {
      findPlace: async () => null,
      saveDetailTranslation: async () => {},
    },
    tourApiService: {
      searchPlacesByLocationTranslated: async (lang, options) => {
        searchArgs = { lang, options };
        return {
          items: [
            {
              contentId: 'near-but-unrelated',
              title: 'Museum of Oriental Embroidery (동양자수박물관)',
              latitude: 37.7779681,
              longitude: 128.8803035,
            },
            {
              contentId: 'same-place',
              title: 'Ojukheon House (강릉 오죽헌)',
              latitude: 37.7791,
              longitude: 128.8797,
            },
          ],
        };
      },
      getPlaceDetailTranslated: async (lang, { contentId }) => ({
        contentId,
        title: 'Ojukheon House',
        address: 'Gangneung',
      }),
    },
  });

  const [overlaid] = await service.attachTranslationOverlay([korItem], 'en');

  assert.equal(searchArgs.lang, 'en');
  assert.equal(searchArgs.options.latitude, korItem.latitude);
  assert.equal(searchArgs.options.longitude, korItem.longitude);
  assert.equal(overlaid.hasTranslatedInfo, true);
  assert.equal(overlaid.title, 'Ojukheon House');
});

test('keeps a cached TourAPI-sourced address romanized without treating it as stale', async () => {
  // TourAPI 자체 번역 서비스는 도로명 주소를 한글도 목표 언어 문자도
  // 아닌 순수 로마자로만 내려주는 경우가 흔하다(실측: 테라로사 본점의
  // 일본어 주소가 '25, Hyeoncheon-gil, Gujeong-myeon, Gangneung-si'). 이건
  // 정상 데이터인데, 캐시 신선도 검사가 "목표 언어 문자가 하나도
  // 없다"는 기준(needsCjkRetranslation)까지 함께 쓰면 매번 다시 캐시
  // 미스로 취급해 불필요한 LLM 재번역을 유발한다. 캐시 신선도는 한글이
  // 새어나온 경우만 봐야 한다.
  const store = new Map();
  let matchCalls = 0;
  const korItem = {
    contentId: '1950195',
    title: '테라로사 본점',
    address: '강원 강릉시 구정면 현천길 25',
    latitude: 37.6960944624,
    longitude: 128.8918383262,
  };
  const service = createCachedPlacesService({
    config: CONFIG,
    clock: () => 10_000,
    repository: {
      findPlace: async contentId => store.get(contentId) ?? null,
      saveDetailTranslation: async ({ contentId, lang, item, cachedAt, expiresAt }) => {
        const record = store.get(contentId) ?? { translations: {} };
        record.translations[lang] = { detail: item, cachedAt, expiresAt };
        store.set(contentId, record);
      },
    },
    tourApiService: {
      searchPlacesByLocationTranslated: async () => {
        matchCalls += 1;
        return {
          items: [{
            contentId: 'matched',
            title: 'Terarosa Coffee Factory (테라로사 본점)',
            latitude: korItem.latitude,
            longitude: korItem.longitude,
          }],
        };
      },
      getPlaceDetailTranslated: async (lang, { contentId }) => ({
        contentId,
        title: 'Terarosa Coffee Factory',
        address: '25, Hyeoncheon-gil, Gujeong-myeon, Gangneung-si',
      }),
    },
  });

  const [first] = await service.attachTranslationOverlay([korItem], 'ja');
  assert.equal(first.address, '25, Hyeoncheon-gil, Gujeong-myeon, Gangneung-si');
  assert.equal(matchCalls, 1);

  // 캐시가 "신선"하다고 정확히 판단되면 TourAPI 매칭을 다시 시도하지
  // 않는다.
  const [second] = await service.attachTranslationOverlay([korItem], 'ja');
  assert.equal(second.address, '25, Hyeoncheon-gil, Gujeong-myeon, Gangneung-si');
  assert.equal(matchCalls, 1);
});

test('translation overlay keeps the Korean item when no nearby candidate title matches', async () => {
  const korItem = {
    contentId: '2764935',
    title: '김동명문학관',
    latitude: 37.820456,
    longitude: 128.837729,
  };
  const service = createCachedPlacesService({
    config: CONFIG,
    clock: () => 10_000,
    repository: {
      findPlace: async () => null,
      saveDetailTranslation: async () => {},
    },
    tourApiService: {
      searchPlacesByLocationTranslated: async () => ({
        items: [
          {
            contentId: 'unrelated-cafe',
            title: 'Some Unrelated Cafe (어떤 카페)',
            latitude: 37.8205,
            longitude: 128.8377,
          },
        ],
      }),
      getPlaceDetailTranslated: async () => {
        throw new Error('should not fetch a detail without a title match');
      },
    },
  });

  const [overlaid] = await service.attachTranslationOverlay([korItem], 'en');

  assert.equal(overlaid.hasTranslatedInfo, false);
  assert.equal(overlaid.title, '김동명문학관');
});

test('does not match a short, generic neighborhood-name substring to an unrelated place', async () => {
  // 실측 사례: "북촌전통공예체험관"(공백 없는 복합 국문 제목)이 근처의
  // 무관한 "락고재 서울 북촌 한옥호텔"로 잘못 매칭됐다. 후보 제목의 "북촌"
  // (동네 이름, 2자)이 원문 제목 안에 부분 문자열로만 우연히 들어있을 뿐인데
  // 이를 같은 장소로 오인했다.
  const korItem = {
    contentId: '2993183',
    title: '북촌전통공예체험관',
    latitude: 37.5826,
    longitude: 126.9847,
  };
  const service = createCachedPlacesService({
    config: CONFIG,
    clock: () => 10_000,
    repository: {
      findPlace: async () => null,
      saveDetailTranslation: async () => {},
    },
    tourApiService: {
      searchPlacesByLocationTranslated: async () => ({
        items: [
          {
            contentId: 'unrelated-hotel',
            title: 'Rakkojae Seoul Bukchon Hanok Hotel (락고재 서울 북촌 한옥호텔)',
            latitude: 37.5827,
            longitude: 126.9848,
          },
        ],
      }),
      getPlaceDetailTranslated: async () => {
        throw new Error('should not fetch a detail without a real title match');
      },
    },
  });

  const [overlaid] = await service.attachTranslationOverlay([korItem], 'en');

  assert.equal(overlaid.hasTranslatedInfo, false);
  assert.equal(overlaid.title, '북촌전통공예체험관');
});

test('re-translates when a detail view has fields a list-sourced cache never had', async () => {
  // 실측 사례: 목록 화면은 PlaceSummary(overview·openTime·restDate가 항상
  // null)만 갖고 있어, 지역 목록에서 먼저 열람된 장소는 title·address만
  // 번역된 "얕은" 캐시가 저장된다. 그 뒤 상세 화면에서 실제 overview 등을
  // 가진 korItem으로 다시 요청해도, 캐시가 "신선"하다는 이유로 그 얕은
  // 번역을 계속 재사용해 About This Place 등이 번역되지 않았다.
  const store = new Map();
  const generateCalls = [];
  const service = createCachedPlacesService({
    config: CONFIG,
    clock: () => 10_000,
    repository: {
      findPlace: async contentId => store.get(contentId) ?? null,
      saveDetailTranslation: async ({ contentId, lang, item, cachedAt, expiresAt }) => {
        const record = store.get(contentId) ?? { translations: {} };
        record.translations[lang] = { detail: item, cachedAt, expiresAt };
        store.set(contentId, record);
      },
    },
    tourApiService: {
      searchPlacesByLocationTranslated: async () => ({ items: [] }),
    },
    llmService: {
      isMockMode: () => false,
      generate: async (systemPrompt, messages) => {
        generateCalls.push(messages);
        const { place: input } = JSON.parse(messages[0].content);
        return {
          content: JSON.stringify({
            title: input.title ? 'Gilsang Ceramics' : '',
            address: input.address ? '15-9 Gangnam-daero 39-gil' : '',
            openTime: input.openTime ? '10:00-22:00' : '',
            overview: input.overview ? 'A pottery workshop in Seoul.' : '',
            restDate: input.restDate ? 'Mondays' : '',
            parking: '',
            regionName: '',
          }),
        };
      },
    },
  });

  // 1) 지역 목록 화면: overview·openTime·restDate가 없는 얕은 요약만 있다.
  const listItem = { contentId: '2946113', title: '길상도예', address: '서초구' };
  const [fromList] = await service.attachTranslationOverlay([listItem], 'en');
  assert.equal(fromList.title, 'Gilsang Ceramics');
  assert.equal(fromList.overview, undefined);
  assert.equal(generateCalls.length, 1);

  // 2) 상세 화면: 같은 장소를 overview·openTime·restDate가 실제로 채워진
  // korItem으로 다시 요청한다. 얕은 캐시가 있어도 다시 번역해야 한다.
  const detailItem = {
    contentId: '2946113',
    title: '길상도예',
    address: '서초구',
    openTime: '10:00~22:00',
    overview: '서울에 있는 도예 공방입니다.',
    restDate: '매주 월요일',
  };
  const [fromDetail] = await service.attachTranslationOverlay([detailItem], 'en');

  assert.equal(generateCalls.length, 2);
  assert.equal(fromDetail.overview, 'A pottery workshop in Seoul.');
  assert.equal(fromDetail.restDate, 'Mondays');
  assert.equal(fromDetail.openTime, '10:00-22:00');

  // 3) 이제 캐시가 완전해졌으니 목록 화면이 다시 물어도 재번역 없이
  // 완전한 캐시를 그대로 재사용한다.
  const [fromListAgain] = await service.attachTranslationOverlay([listItem], 'en');
  assert.equal(generateCalls.length, 2);
  assert.equal(fromListAgain.overview, 'A pottery workshop in Seoul.');
});

test('retries LLM translation when the cache has no title even though the source has one', async () => {
  // 실측 사례: "갗"처럼 단어 하나짜리 낯선 고유명사는 LLM이 처음엔 자신
  // 없어 title을 빈 값으로 남길 수 있다(다른 필드는 성공). 그 결과가
  // 그대로 캐시되면 다음 조회도 계속 원문 그대로 나온다 — title이 없는
  // 캐시는 완전하지 않다고 보고 다시 시도해야 한다.
  const store = new Map();
  const generateCalls = [];
  let shouldTranslateTitle = false;
  const service = createCachedPlacesService({
    config: CONFIG,
    clock: () => 10_000,
    repository: {
      findPlace: async contentId => store.get(contentId) ?? null,
      saveDetailTranslation: async ({ contentId, lang, item, cachedAt, expiresAt }) => {
        const record = store.get(contentId) ?? { translations: {} };
        record.translations[lang] = { detail: item, cachedAt, expiresAt };
        store.set(contentId, record);
      },
    },
    tourApiService: {
      searchPlacesByLocationTranslated: async () => ({ items: [] }),
    },
    llmService: {
      isMockMode: () => false,
      generate: async () => {
        generateCalls.push(1);
        return {
          content: JSON.stringify({
            title: shouldTranslateTitle ? 'Gat' : '',
            address: 'Jongno-gu, Seoul',
            openTime: '',
            overview: '',
            restDate: '',
            parking: '',
            regionName: '',
          }),
        };
      },
    },
  });
  const korItem = {
    contentId: '3486753',
    title: '갗',
    address: '종로구',
    latitude: 37.5734,
    longitude: 127.0215,
  };

  const [first] = await service.attachTranslationOverlay([korItem], 'en');
  assert.equal(first.title, '갗');
  assert.equal(first.address, 'Jongno-gu, Seoul');
  assert.equal(generateCalls.length, 1);

  shouldTranslateTitle = true;
  const [second] = await service.attachTranslationOverlay([korItem], 'en');
  assert.equal(second.title, 'Gat');
  assert.equal(generateCalls.length, 2);

  // 이제 title이 채워졌으니 더는 재시도하지 않는다.
  const [third] = await service.attachTranslationOverlay([korItem], 'en');
  assert.equal(third.title, 'Gat');
  assert.equal(generateCalls.length, 2);
});

test('retries LLM translation when the cached title was never actually translated (identical to Korean)', async () => {
  // 실측 사례: '대학천 책방거리', '소수책방'처럼 한글 고유명사가 낀 짧은
  // 지명·상호명을 LLM이 로마자 음역 없이 원문 그대로 반환하는 경우가
  // 있었다. 그 결과가 그대로 캐시되면 title 필드 자체는 "채워져 있어"
  // 얕은 캐시 감지(비어있는 필드 검사)를 통과해 버려, 다음 조회에서도
  // 계속 한글 그대로 나왔다. 캐시된 title이 한글을 포함한 원문과 완전히
  // 같으면 "번역 실패"로 보고 다시 시도해야 한다.
  const store = new Map();
  const generateCalls = [];
  let shouldTranslateTitle = false;
  const service = createCachedPlacesService({
    config: CONFIG,
    clock: () => 10_000,
    repository: {
      findPlace: async contentId => store.get(contentId) ?? null,
      saveDetailTranslation: async ({ contentId, lang, item, cachedAt, expiresAt }) => {
        const record = store.get(contentId) ?? { translations: {} };
        record.translations[lang] = { detail: item, cachedAt, expiresAt };
        store.set(contentId, record);
      },
    },
    tourApiService: {
      searchPlacesByLocationTranslated: async () => ({ items: [] }),
    },
    llmService: {
      isMockMode: () => false,
      generate: async (systemPrompt, messages) => {
        generateCalls.push(messages);
        const { place: input } = JSON.parse(messages[0].content);
        return {
          content: JSON.stringify({
            title: shouldTranslateTitle ? 'Daehakcheon Bookstore Street' : input.title,
            address: '',
            openTime: '',
            overview: '',
            restDate: '',
            parking: '',
            regionName: '',
          }),
        };
      },
    },
  });

  const korItem = { contentId: '132202', title: '대학천 책방거리' };

  // 첫 조회: title이 계속 원문 그대로라 요청 안에서 최대치(2번)까지
  // 즉시 재시도하지만(총 3번 호출) 그래도 실패해 캐시되지 않는다.
  const [first] = await service.attachTranslationOverlay([korItem], 'ja');
  assert.equal(first.title, '대학천 책방거리');
  assert.equal(generateCalls.length, 3);

  shouldTranslateTitle = true;
  const [second] = await service.attachTranslationOverlay([korItem], 'ja');
  assert.equal(second.title, 'Daehakcheon Bookstore Street');
  assert.equal(generateCalls.length, 4);

  // 이제 실제로 번역됐고 캐시됐으니 더는 재시도하지 않는다.
  const [third] = await service.attachTranslationOverlay([korItem], 'ja');
  assert.equal(third.title, 'Daehakcheon Bookstore Street');
  assert.equal(generateCalls.length, 4);
});

test('retries when a non-title field (e.g. parking) was left untranslated, identical to Korean', async () => {
  // 실측 사례: '소수책방'의 parking 필드가 중국어 요청에서 title·overview
  // 등 다른 필드는 다 번역됐는데 parking만 '가능'(국문 원문)으로 그대로
  // 남았다. title만 검사하던 기존 로직은 이 사례를 얕은 캐시로 보지
  // 못해 영원히 캐시했다 — TRANSLATION_OVERLAY_FIELDS 전체로 검사
  // 범위를 넓혀야 한다.
  const store = new Map();
  const generateCalls = [];
  let shouldTranslateParking = false;
  const service = createCachedPlacesService({
    config: CONFIG,
    clock: () => 10_000,
    repository: {
      findPlace: async contentId => store.get(contentId) ?? null,
      saveDetailTranslation: async ({ contentId, lang, item, cachedAt, expiresAt }) => {
        const record = store.get(contentId) ?? { translations: {} };
        record.translations[lang] = { detail: item, cachedAt, expiresAt };
        store.set(contentId, record);
      },
    },
    tourApiService: {
      searchPlacesByLocationTranslated: async () => ({ items: [] }),
    },
    llmService: {
      isMockMode: () => false,
      generate: async (systemPrompt, messages) => {
        generateCalls.push(messages);
        const { place: input } = JSON.parse(messages[0].content);
        return {
          content: JSON.stringify({
            title: 'Sosubookstore',
            address: '',
            openTime: '',
            overview: '',
            restDate: '',
            parking: shouldTranslateParking ? '可能' : input.parking,
            regionName: '',
          }),
        };
      },
    },
  });

  const korItem = { contentId: '2989636', title: '소수책방', parking: '가능' };

  // 첫 조회: parking이 계속 원문 그대로라 요청 안에서 최대치(2번)까지
  // 즉시 재시도하지만(총 3번 호출) 그래도 실패해 캐시되지 않는다.
  const [first] = await service.attachTranslationOverlay([korItem], 'zh');
  assert.equal(first.parking, '가능');
  assert.equal(generateCalls.length, 3);

  shouldTranslateParking = true;
  const [second] = await service.attachTranslationOverlay([korItem], 'zh');
  assert.equal(second.parking, '可能');
  assert.equal(generateCalls.length, 4);

  // 이제 실제로 번역됐고 캐시됐으니 더는 재시도하지 않는다.
  const [third] = await service.attachTranslationOverlay([korItem], 'zh');
  assert.equal(third.parking, '可能');
  assert.equal(generateCalls.length, 4);
});

test('retries when a translated field has unwrapped Korean text mixed in (no parens)', async () => {
  // 실측 사례 두 가지: (1) '강릉 선교장'의 중국어 title이 번역문과 한글
  // 원문을 괄호 없이 그냥 이어붙여 '江陵船桥庄강릉 선교장'으로 나옴,
  // (2) '안동 하회마을'의 아주 긴 중국어 overview 중간에 번역되지 않은
  // 한글 문장 한 토막이 그대로 섞여 나옴. 두 경우 모두 필드 전체가
  // 원문과 동일하진 않아(hasUntranslatedKoreanField로는 못 잡음) 괄호
  // 밖 한글 잔존 여부를 따로 봐야 한다.
  const store = new Map();
  const generateCalls = [];
  let isFixed = false;
  const service = createCachedPlacesService({
    config: CONFIG,
    clock: () => 10_000,
    repository: {
      findPlace: async contentId => store.get(contentId) ?? null,
      saveDetailTranslation: async ({ contentId, lang, item, cachedAt, expiresAt }) => {
        const record = store.get(contentId) ?? { translations: {} };
        record.translations[lang] = { detail: item, cachedAt, expiresAt };
        store.set(contentId, record);
      },
    },
    tourApiService: {
      searchPlacesByLocationTranslated: async () => ({ items: [] }),
    },
    llmService: {
      isMockMode: () => false,
      generate: async (systemPrompt, messages) => {
        generateCalls.push(messages);
        return {
          content: JSON.stringify({
            title: isFixed ? '江陵船桥庄（강릉 선교장）' : '江陵船桥庄강릉 선교장',
            address: '',
            openTime: '',
            overview: '',
            restDate: '',
            parking: '',
            regionName: '',
          }),
        };
      },
    },
  });

  const korItem = { contentId: '125800', title: '강릉 선교장' };

  // 첫 조회: title에 괄호 없는 한글이 섞여 있어 요청 안에서 재시도까지
  // 다 써보지만(총 3번 호출) 그래도 실패해 캐시되지 않는다.
  const [first] = await service.attachTranslationOverlay([korItem], 'zh');
  assert.equal(first.title, '江陵船桥庄강릉 선교장');
  assert.equal(generateCalls.length, 3);

  isFixed = true;
  const [second] = await service.attachTranslationOverlay([korItem], 'zh');
  assert.equal(second.title, '江陵船桥庄（강릉 선교장）');
  assert.equal(generateCalls.length, 4);

  // 이제 괄호로 올바르게 감쌌으니 더는 재시도하지 않는다.
  const [third] = await service.attachTranslationOverlay([korItem], 'zh');
  assert.equal(third.title, '江陵船桥庄（강릉 선교장）');
  assert.equal(generateCalls.length, 4);
});

test('retries once when the LLM answers ja/zh requests entirely in English', async () => {
  // 실측 사례: OpenRouter는 temperature:0이어도 완전히 결정적이지 않아,
  // 일본어 요청인데도 응답 전체(overview 포함)가 영어로 나오는 경우가
  // 드물게 있었다(실측: '대학천 책방거리'). overview에 목표 언어(일본어/
  // 중국어) 문자가 하나도 없으면 재시도해야 한다.
  const store = new Map();
  const generateCalls = [];
  let attempt = 0;
  const service = createCachedPlacesService({
    config: CONFIG,
    clock: () => 10_000,
    repository: {
      findPlace: async contentId => store.get(contentId) ?? null,
      saveDetailTranslation: async ({ contentId, lang, item, cachedAt, expiresAt }) => {
        const record = store.get(contentId) ?? { translations: {} };
        record.translations[lang] = { detail: item, cachedAt, expiresAt };
        store.set(contentId, record);
      },
    },
    tourApiService: {
      searchPlacesByLocationTranslated: async () => ({ items: [] }),
    },
    llmService: {
      isMockMode: () => false,
      generate: async (systemPrompt, messages) => {
        generateCalls.push(messages);
        attempt += 1;
        return {
          content: JSON.stringify({
            title: 'Daehakcheon Bookstore Street',
            address: '',
            openTime: '',
            overview: attempt === 1
              ? 'Daehakcheon Bookstore Street is an old alley.'
              : '大学川書店通りは、古本を安く購入できる古い通りです。',
            restDate: '',
            parking: '',
            regionName: '',
          }),
        };
      },
    },
  });

  const korItem = {
    contentId: '132202',
    title: '대학천 책방거리',
    overview: '대학천 책방거리는 헌책을 저렴하게 구입할 수 있는 오래된 거리이다.',
  };

  const [result] = await service.attachTranslationOverlay([korItem], 'ja');

  assert.equal(generateCalls.length, 2);
  assert.match(messagesReminder(generateCalls[1]), /목표 언어가 아닌/);
  assert.equal(result.overview, '大学川書店通りは、古本を安く購入できる古い通りです。');
});

function messagesReminder(messages) {
  return JSON.parse(messages[0].content).reminder || '';
}

test('does not cache an ja/zh translation that stayed in English after two retries', async () => {
  // 재시도 두 번을 다 써도 여전히 영어로만 나오는 최악의 경우, 이번
  // 요청엔 그 결과를 그대로 보여주더라도 캐시에는 저장하지 않아야
  // 다음 조회에서 바로 다시 시도할 수 있다.
  const store = new Map();
  const generateCalls = [];
  const service = createCachedPlacesService({
    config: CONFIG,
    clock: () => 10_000,
    repository: {
      findPlace: async contentId => store.get(contentId) ?? null,
      saveDetailTranslation: async ({ contentId, lang, item, cachedAt, expiresAt }) => {
        const record = store.get(contentId) ?? { translations: {} };
        record.translations[lang] = { detail: item, cachedAt, expiresAt };
        store.set(contentId, record);
      },
    },
    tourApiService: {
      searchPlacesByLocationTranslated: async () => ({ items: [] }),
    },
    llmService: {
      isMockMode: () => false,
      generate: async (systemPrompt, messages) => {
        generateCalls.push(messages);
        return {
          content: JSON.stringify({
            title: 'Daehakcheon Bookstore Street',
            address: '',
            openTime: '',
            overview: 'Daehakcheon Bookstore Street is an old alley.',
            restDate: '',
            parking: '',
            regionName: '',
          }),
        };
      },
    },
  });

  const korItem = {
    contentId: '132202',
    title: '대학천 책방거리',
    overview: '대학천 책방거리는 헌책을 저렴하게 구입할 수 있는 오래된 거리이다.',
  };

  const [result] = await service.attachTranslationOverlay([korItem], 'ja');
  assert.equal(generateCalls.length, 3);
  assert.equal(result.overview, 'Daehakcheon Bookstore Street is an old alley.');

  // 캐시에 저장되지 않았으니, 다음 조회는 처음부터 다시 시도한다.
  await service.attachTranslationOverlay([korItem], 'ja');
  assert.equal(generateCalls.length, 6);
});

test('falls back to LLM translation when a TourAPI match has no usable title', async () => {
  // 실측 사례: '가나아트센터'가 일본어 서비스에서 후보는 찾았지만(좌표·
  // 부분 제목 일치) 그 레코드 자체의 title이 비어있었다 — item이 truthy라
  // LLM 폴백 조건(!item)에 걸리지 않아 원문 그대로 나왔다. title 없는
  // "매칭 성공"은 매칭 실패와 똑같이 취급해 LLM로 넘어가야 한다.
  const korItem = {
    contentId: '129854',
    title: '가나아트센터',
    address: '서울특별시 종로구 평창30길 28',
    latitude: 37.6123,
    longitude: 126.9751,
  };
  const generateCalls = [];
  const service = createCachedPlacesService({
    config: CONFIG,
    clock: () => 10_000,
    repository: {
      findPlace: async () => null,
      saveDetailTranslation: async () => {},
    },
    tourApiService: {
      searchPlacesByLocationTranslated: async () => ({
        items: [{
          contentId: 'matched-but-titleless',
          title: '가나아트센터',
          latitude: 37.6123,
          longitude: 126.9751,
        }],
      }),
      getPlaceDetailTranslated: async () => ({ contentId: 'matched-but-titleless', title: '' }),
    },
    llmService: {
      isMockMode: () => false,
      generate: async () => {
        generateCalls.push(1);
        return {
          content: JSON.stringify({
            title: 'Gana Art Center', address: '', openTime: '', overview: '', restDate: '', parking: '', regionName: '',
          }),
        };
      },
    },
  });

  const [overlaid] = await service.attachTranslationOverlay([korItem], 'ja');

  assert.equal(overlaid.title, 'Gana Art Center');
  assert.equal(generateCalls.length, 1);
});

test('falls back to LLM translation when the TourAPI translation service itself errors', async () => {
  // 실측 사례: 공공데이터포털 tourEng 서비스가 일일 호출 한도 등으로
  // HTTP_ERROR를 반환하기 시작하면 findTranslatedContentId가 예외를
  // 던진다. 이 예외가 getTranslatedDetail의 바깥 catch까지 그대로
  // 번져버리면, TourAPI 장애 하나 때문에 이미 검증된 국문 정보로 시도할
  // 수 있는 LLM 번역 기회까지 통째로 사라진다 — 매칭 조회 실패는 매칭
  // 없음으로만 취급하고 LLM 폴백은 계속 시도해야 한다.
  const korItem = {
    contentId: '2946113',
    title: '길상도예',
    address: '서초구',
    latitude: 37.5,
    longitude: 127.0,
  };
  const generateCalls = [];
  const service = createCachedPlacesService({
    config: CONFIG,
    clock: () => 10_000,
    repository: {
      findPlace: async () => null,
      saveDetailTranslation: async () => {},
    },
    tourApiService: {
      searchPlacesByLocationTranslated: async () => {
        throw new ExternalApiError('일일 호출 한도를 초과했습니다.', { code: 'HTTP_ERROR' });
      },
      getPlaceDetailTranslated: async () => {
        throw new Error('should not be called when the candidate search itself failed');
      },
    },
    llmService: {
      isMockMode: () => false,
      generate: async () => {
        generateCalls.push(1);
        return {
          content: JSON.stringify({
            title: 'Gilsang Ceramics', address: '', openTime: '', overview: '', restDate: '', parking: '', regionName: '',
          }),
        };
      },
    },
  });

  const [overlaid] = await service.attachTranslationOverlay([korItem], 'en');

  assert.equal(overlaid.title, 'Gilsang Ceramics');
  assert.equal(overlaid.hasTranslatedInfo, true);
  assert.equal(generateCalls.length, 1);
});

test('never caches a totally empty LLM result, so the very next request retries', async () => {
  // 실측 사례: '고양이똥'처럼 특이한 상호명에서 LLM이 모든 필드를 빈
  // 값으로 반환한 적이 있었다. 이 결과를 그대로 캐시하면 mock 모드나
  // 정상적인 "TourAPI에 없음" 판정과 똑같이 취급돼 TTL이 끝날 때까지
  // 원문만 나온다 — 실패는 캐시하지 않고 바로 다음 조회에서 다시
  // 시도해야 한다.
  const store = new Map();
  const generateCalls = [];
  let shouldSucceed = false;
  const service = createCachedPlacesService({
    config: CONFIG,
    clock: () => 10_000,
    repository: {
      findPlace: async contentId => store.get(contentId) ?? null,
      saveDetailTranslation: async ({ contentId, lang, item, cachedAt, expiresAt }) => {
        const record = store.get(contentId) ?? { translations: {} };
        record.translations[lang] = { detail: item, cachedAt, expiresAt };
        store.set(contentId, record);
      },
    },
    tourApiService: {
      searchPlacesByLocationTranslated: async () => ({ items: [] }),
    },
    llmService: {
      isMockMode: () => false,
      generate: async () => {
        generateCalls.push(1);
        return {
          content: JSON.stringify({
            title: shouldSucceed ? 'Goyangidong' : '',
            address: '', openTime: '', overview: '', restDate: '', parking: '', regionName: '',
          }),
        };
      },
    },
  });
  const korItem = { contentId: '2860975', title: '고양이똥', latitude: 37.552, longitude: 126.8646 };

  const [first] = await service.attachTranslationOverlay([korItem], 'ja');
  assert.equal(first.hasTranslatedInfo, false);
  assert.equal(generateCalls.length, 1);

  shouldSucceed = true;
  const [second] = await service.attachTranslationOverlay([korItem], 'ja');
  assert.equal(second.title, 'Goyangidong');
  assert.equal(generateCalls.length, 2);
});

test('falls back to LLM translation when no TourAPI candidate matches', async () => {
  const korItem = {
    contentId: '2764935',
    title: '김동명문학관',
    address: '강릉시 사천면 방동리',
    openTime: '09:00~18:00',
    overview: '김유정 작가를 기리는 문학관입니다.',
    restDate: '매주 월요일 휴관',
    parking: '가능',
    regionName: '강원특별자치도',
    latitude: 37.820456,
    longitude: 128.837729,
  };
  const generateCalls = [];
  const service = createCachedPlacesService({
    config: CONFIG,
    clock: () => 10_000,
    repository: {
      findPlace: async () => null,
      saveDetailTranslation: async () => {},
    },
    tourApiService: {
      searchPlacesByLocationTranslated: async () => ({ items: [] }),
      getPlaceDetailTranslated: async () => {
        throw new Error('should not fetch a detail without a title match');
      },
    },
    llmService: {
      isMockMode: () => false,
      generate: async (systemPrompt, messages, requestOptions) => {
        generateCalls.push({ systemPrompt, messages, requestOptions });
        return {
          content: JSON.stringify({
            title: 'Kim Dong-myeong Literature Museum',
            address: 'Sacheon-myeon, Gangneung',
            openTime: '09:00-18:00',
            overview: 'A literature museum honoring writer Kim Dong-myeong.',
            restDate: 'Closed every Monday',
            parking: 'Available',
            regionName: 'Gangwon Special Self-Governing Province',
          }),
        };
      },
    },
  });

  const [overlaid] = await service.attachTranslationOverlay([korItem], 'en');

  assert.equal(overlaid.hasTranslatedInfo, true);
  assert.equal(overlaid.title, 'Kim Dong-myeong Literature Museum');
  assert.equal(overlaid.address, 'Sacheon-myeon, Gangneung');
  assert.equal(overlaid.openTime, '09:00-18:00');
  assert.equal(overlaid.overview, 'A literature museum honoring writer Kim Dong-myeong.');
  assert.equal(overlaid.restDate, 'Closed every Monday');
  assert.equal(overlaid.parking, 'Available');
  assert.equal(overlaid.regionName, 'Gangwon Special Self-Governing Province');
  assert.equal(generateCalls.length, 1);
  assert.equal(generateCalls[0].requestOptions.jsonSchema.name, 'culturepath_place_translation');
});

test('keeps the Korean item when LLM translation fails after a TourAPI miss', async () => {
  const korItem = {
    contentId: '2764935',
    title: '김동명문학관',
    latitude: 37.820456,
    longitude: 128.837729,
  };
  const service = createCachedPlacesService({
    config: CONFIG,
    clock: () => 10_000,
    repository: {
      findPlace: async () => null,
      saveDetailTranslation: async () => {},
    },
    tourApiService: {
      searchPlacesByLocationTranslated: async () => ({ items: [] }),
    },
    llmService: {
      isMockMode: () => false,
      generate: async () => {
        throw new Error('OpenRouter timeout');
      },
    },
  });

  const [overlaid] = await service.attachTranslationOverlay([korItem], 'en');

  assert.equal(overlaid.hasTranslatedInfo, false);
  assert.equal(overlaid.title, '김동명문학관');
});

test('skips LLM translation in mock mode and keeps the Korean item', async () => {
  const korItem = {
    contentId: '2764935',
    title: '김동명문학관',
    latitude: 37.820456,
    longitude: 128.837729,
  };
  let generateCalls = 0;
  const service = createCachedPlacesService({
    config: CONFIG,
    clock: () => 10_000,
    repository: {
      findPlace: async () => null,
      saveDetailTranslation: async () => {},
    },
    tourApiService: {
      searchPlacesByLocationTranslated: async () => ({ items: [] }),
    },
    llmService: {
      isMockMode: () => true,
      generate: async () => {
        generateCalls += 1;
        return { content: '{}' };
      },
    },
  });

  const [overlaid] = await service.attachTranslationOverlay([korItem], 'en');

  assert.equal(overlaid.hasTranslatedInfo, false);
  assert.equal(generateCalls, 0);
});

test('translation overlay prefers the candidate with more overlapping title tokens over a partial match', async () => {
  // 실측 사례: 국문 "강릉 오죽헌·시립박물관"에 대해 중문 서비스는 부속기관명을
  // 축약한 후보("...강릉 오죽헌")와 온전한 후보("...강릉시 오죽헌/시립박물관")를
  // 함께 반환한다. 괄호 없이 국문이 이어붙는 경우와 부속기관명 표기 차이
  // ("강릉" vs "강릉시", "·" vs "/")까지 고려해 더 많이 겹치는 쪽을 골라야 한다.
  const korItem = {
    contentId: '129784',
    title: '강릉 오죽헌·시립박물관',
    latitude: 37.7791389,
    longitude: 128.8796621,
  };
  const service = createCachedPlacesService({
    config: CONFIG,
    clock: () => 10_000,
    repository: {
      findPlace: async () => null,
      saveDetailTranslation: async () => {},
    },
    tourApiService: {
      searchPlacesByLocationTranslated: async () => ({
        items: [
          {
            contentId: 'partial-match',
            title: '江陵乌竹轩강릉 오죽헌',
            latitude: 37.7791,
            longitude: 128.8797,
          },
          {
            contentId: 'full-match',
            title: '江陵市乌竹轩/市立博物馆(강릉시 오죽헌/시립박물관)',
            latitude: 37.7790,
            longitude: 128.8796,
          },
        ],
      }),
      getPlaceDetailTranslated: async (lang, { contentId }) => ({
        contentId,
        title: contentId === 'full-match' ? '江陵市乌竹轩/市立博物馆' : '江陵乌竹轩',
      }),
    },
  });

  const [overlaid] = await service.attachTranslationOverlay([korItem], 'zh');

  assert.equal(overlaid.hasTranslatedInfo, true);
  assert.equal(overlaid.title, '江陵市乌竹轩/市立博物馆');
});
