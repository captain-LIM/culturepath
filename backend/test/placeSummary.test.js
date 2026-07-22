'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createPlaceSummary } = require('../src/models/placeSummary');

test('PlaceSummary keeps every documented nullable field as null', () => {
  const summary = createPlaceSummary({ contentId: '1', title: '장소' });

  assert.deepEqual(summary, {
    contentId: '1',
    contentTypeId: null,
    title: '장소',
    overview: null,
    areaCode: null,
    sigunguCode: null,
    lDongRegnCd: null,
    lDongSignguCd: null,
    regionName: null,
    address: null,
    latitude: null,
    longitude: null,
    tel: null,
    openTime: null,
    restDate: null,
    imageUrl: null,
    thumbnailUrl: null,
    lclsSystmCodes: [],
    cultures: [],
    category: '기타',
    source: 'TOUR_API',
    sourceUpdatedAt: null,
  });
  assert.equal(JSON.parse(JSON.stringify(summary)).lDongRegnCd, null);
});
