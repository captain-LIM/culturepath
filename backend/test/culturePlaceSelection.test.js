'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
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
    20,
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
