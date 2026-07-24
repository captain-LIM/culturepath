'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  calculateTrendScore,
  combineCacheStatuses,
  createRegionScoreService,
  normalizeDensity,
  sumNonResidentVisitors,
} = require('../src/services/regionScoreService');
const { getRegionDefinition } = require('../src/config/regionCatalog');

function visitor(level, code, baseYmd, visitorTypeCode, visitorCount) {
  return {
    level,
    code,
    name: code,
    dayOfWeekCode: '4',
    dayOfWeekName: '목요일',
    visitorTypeCode,
    visitorTypeName: visitorTypeCode === '2' ? '외지인(b)' : '외국인(c)',
    visitorCount,
    baseYmd,
  };
}

function rows(level, code, baseYmd, total) {
  return [
    visitor(level, code, baseYmd, '2', total * 0.9),
    visitor(level, code, baseYmd, '3', total * 0.1),
  ];
}

function result(items, cacheStatus) {
  return {
    items,
    pagination: { pageNo: 1, numOfRows: 1000, totalCount: items.length },
    cacheStatus,
  };
}

test('calculates density, non-resident visitors, and bounded trend scores', () => {
  const density = normalizeDensity([
    { areaCode: 'a', spotCount: 5 },
    { areaCode: 'b', spotCount: 10 },
  ]);
  assert.equal(density.get('a'), 0);
  assert.equal(density.get('b'), 100);
  assert.equal(calculateTrendScore(120, 100), 100);
  assert.equal(calculateTrendScore(100, 100), 50);
  assert.equal(calculateTrendScore(80, 100), 0);
  assert.equal(calculateTrendScore(1, 0), 100);
  assert.equal(calculateTrendScore(0, 0), 50);
  assert.equal(calculateTrendScore(null, 1), null);
  assert.equal(
    combineCacheStatuses(['HIT', 'REFRESHED', 'STALE']),
    'STALE',
  );

  const definition = getRegionDefinition('gangneung');
  const items = [
    ...rows('local', '42150', '20210513', 100.5),
    visitor('local', '42150', '20210513', '1', 999),
  ];
  assert.equal(
    sumNonResidentVisitors(items, definition, '20210513'),
    100.5,
  );
  assert.equal(
    sumNonResidentVisitors(
      rows('local', '45111', '20210513', 100),
      getRegionDefinition('jeonju'),
      '20210513',
    ),
    null,
  );
});

test('handles new region aliases without double-counting and sums every district group', () => {
  assert.equal(
    sumNonResidentVisitors(
      [
        ...rows('local', '42150', '20210513', 100),
        ...rows('local', '51150', '20210513', 200),
      ],
      getRegionDefinition('gangneung'),
      '20210513',
    ),
    100,
  );
  assert.equal(
    sumNonResidentVisitors(
      [
        ...rows('local', '52111', '20210513', 60),
        ...rows('local', '52113', '20210513', 40),
      ],
      getRegionDefinition('jeonju'),
      '20210513',
    ),
    100,
  );
  assert.equal(
    sumNonResidentVisitors(
      [
        ...rows('local', '47111', '20210513', 70),
        ...rows('local', '47113', '20210513', 30),
      ],
      getRegionDefinition('pohang'),
      '20210513',
    ),
    100,
  );
  assert.equal(
    sumNonResidentVisitors(
      rows('local', '47111', '20210513', 70),
      getRegionDefinition('pohang'),
      '20210513',
    ),
    null,
  );
});

test('combines 40/30/30 inputs and preserves the RegionItem contract', async () => {
  const currentItems = [
    ...rows('local', '48220', '20210513', 120),
    ...rows('local', '42150', '20210513', 100),
    ...rows('local', '48850', '20210513', 80),
  ];
  const previousItems = [
    ...rows('local', '48220', '20210506', 100),
    ...rows('local', '42150', '20210506', 100),
    ...rows('local', '48850', '20210506', 100),
  ];
  const calls = [];
  const service = createRegionScoreService({
    config: { referenceYmd: '20210513', compareDays: 7 },
    dataLabService: {
      async getAllLocalVisitors(input) {
        calls.push(input);
        return input.startYmd === '20210513'
          ? result(currentItems, 'REFRESHED')
          : result(previousItems, 'HIT');
      },
    },
  });

  const response = await service.getRegionsByCulture(2);

  assert.equal(response.dataStatus, 'REFRESHED');
  assert.deepEqual(
    response.items.map(item => [item.areaCode, item.score]),
    [['tongyeong', 99], ['gangneung', 55], ['hadong', 25]],
  );
  assert.deepEqual(Object.keys(response.items[0]).sort(), [
    'areaCode',
    'description',
    'name',
    'score',
    'spotCount',
  ]);
  assert.deepEqual(calls, [
    { startYmd: '20210513', endYmd: '20210513' },
    { startYmd: '20210506', endYmd: '20210506' },
  ]);
});

test('uses at most four cached DataLab queries when local and metro data are needed', async () => {
  const calls = [];
  const service = createRegionScoreService({
    config: { referenceYmd: '20210513', compareDays: 7 },
    dataLabService: {
      async getAllLocalVisitors(input) {
        calls.push({ level: 'local', input });
        const date = input.startYmd;
        return result([
          ...rows('local', '42150', date, 100),
          ...rows('local', '45111', date, 60),
          ...rows('local', '45113', date, 40),
        ], 'HIT');
      },
      async getAllMetropolitanVisitors(input) {
        calls.push({ level: 'metropolitan', input });
        return result(
          rows('metropolitan', '11', input.startYmd, 100),
          'HIT',
        );
      },
    },
  });

  const response = await service.getRegionsByCulture(1);

  assert.equal(response.dataStatus, 'HIT');
  assert.equal(response.items.length, 3);
  assert.equal(calls.length, 4);
  assert.deepEqual(
    calls.map(call => `${call.level}:${call.input.startYmd}`),
    [
      'local:20210513',
      'local:20210506',
      'metropolitan:20210513',
      'metropolitan:20210506',
    ],
  );
});

test('falls back to the current curated ranking for missing or failed visitor data', async () => {
  const missing = createRegionScoreService({
    config: { referenceYmd: '20210513', compareDays: 7 },
    dataLabService: {
      getAllLocalVisitors: async () => result([], 'HIT'),
    },
  });
  const missingResult = await missing.getRegionsByCulture(2);
  assert.equal(missingResult.dataStatus, 'CURATED');
  assert.deepEqual(
    missingResult.items.map(item => item.score),
    [95, 88, 83],
  );

  const warnings = [];
  const failed = createRegionScoreService({
    config: { referenceYmd: '20210513', compareDays: 7 },
    dataLabService: {
      getAllLocalVisitors: async () => {
        throw new Error('upstream failed');
      },
    },
    logger: { warn(message, detail) { warnings.push({ message, detail }); } },
  });
  const failedResult = await failed.getRegionsByCulture(2);
  assert.equal(failedResult.dataStatus, 'CURATED');
  assert.equal(warnings[0].detail.errorName, 'Error');
  assert.equal(await failed.getRegionsByCulture(999), null);
});
