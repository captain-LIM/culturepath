'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  normalizeCoordinate,
  normalizeHttpUrl,
  normalizeTourPlace,
  normalizeTourTimestamp,
} = require('../src/utils/normalizeTourPlace');

test('normalizes a TourAPI list item into PlaceSummary', () => {
  const result = normalizeTourPlace({
    contentid: 123456,
    contenttypeid: 14,
    title: '  <b>박경리</b>   문학관  ',
    addr1: '경상남도 통영시',
    addr2: '산양읍 1',
    areacode: 36,
    sigungucode: 17,
    lDongRegnCd: 48,
    lDongSignguCd: 220,
    mapx: '128.395',
    mapy: '34.832',
    tel: ' ',
    firstimage: 'http://example.com/image.jpg',
    firstimage2: 'https://example.com/thumb.jpg',
    lclsSystm1: 'VE',
    lclsSystm2: 'VE01',
    lclsSystm3: 'VE010100',
    modifiedtime: '20260722153045',
  });

  assert.deepEqual(result, {
    contentId: '123456',
    contentTypeId: '14',
    title: '박경리 문학관',
    overview: null,
    areaCode: '36',
    sigunguCode: '17',
    lDongRegnCd: '48',
    lDongSignguCd: '220',
    regionName: null,
    address: '경상남도 통영시 산양읍 1',
    latitude: 34.832,
    longitude: 128.395,
    tel: null,
    openTime: null,
    restDate: null,
    imageUrl: 'http://example.com/image.jpg',
    thumbnailUrl: 'https://example.com/thumb.jpg',
    lclsSystmCodes: ['VE', 'VE01', 'VE010100'],
    cultures: ['문학'],
    category: '문학',
    source: 'TOUR_API',
    sourceUpdatedAt: '2026-07-22T15:30:45+09:00',
  });
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.cultures));
});

test('preserves missing and invalid optional data as null', () => {
  const result = normalizeTourPlace({
    contentid: '1',
    title: '일반 관광 안내소',
    mapx: '999',
    mapy: 'not-a-number',
    firstimage: 'javascript:alert(1)',
    modifiedtime: '20260230000000',
  });

  assert.equal(result.contentTypeId, null);
  assert.equal(result.areaCode, null);
  assert.equal(result.sigunguCode, null);
  assert.equal(result.lDongRegnCd, null);
  assert.equal(result.lDongSignguCd, null);
  assert.equal(result.address, null);
  assert.equal(result.longitude, null);
  assert.equal(result.latitude, null);
  assert.equal(result.imageUrl, null);
  assert.equal(result.sourceUpdatedAt, null);
  assert.deepEqual(result.cultures, []);
  assert.equal(result.category, '기타');
});

test('rejects items without contentId or title', () => {
  assert.throws(
    () => normalizeTourPlace({ title: '제목만 있음' }),
    error => error.code === 'INVALID_RESPONSE',
  );
  assert.throws(
    () => normalizeTourPlace({ contentid: '1' }),
    error => error.code === 'INVALID_RESPONSE',
  );
});

test('normalization helpers enforce coordinate, URL, and timestamp boundaries', () => {
  assert.equal(normalizeCoordinate('-90', -90, 90), -90);
  assert.equal(normalizeCoordinate('90.1', -90, 90), null);
  assert.equal(normalizeHttpUrl('ftp://example.com/file'), null);
  assert.equal(normalizeTourTimestamp('20260229010101'), null);
  assert.equal(
    normalizeTourTimestamp('20240229010101'),
    '2024-02-29T01:01:01+09:00',
  );
});
