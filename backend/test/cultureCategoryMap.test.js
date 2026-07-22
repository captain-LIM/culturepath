'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  CULTURE_CATEGORIES,
  classifyTourPlace,
} = require('../src/config/cultureCategoryMap');

test('classifies with conservative official-code and keyword rules', () => {
  assert.deepEqual(
    classifyTourPlace({ title: '박경리 문학관', lclsSystm1: 'VE' }),
    ['문학'],
  );
  assert.deepEqual(
    classifyTourPlace({ title: '전통주 양조장과 커피 카페', lclsSystm1: 'FD' }),
    ['전통주·양조장', '커피·카페'],
  );
  assert.deepEqual(
    classifyTourPlace({ title: '지역 음식점', lclsSystm1: 'FD' }),
    ['로컬 미식'],
  );
});

test('official classification prevents unrelated keyword assignment', () => {
  assert.deepEqual(
    classifyTourPlace({ title: '커피가 있는 현대미술관', lclsSystm1: 'VE' }),
    ['미술·갤러리'],
  );
  assert.deepEqual(
    classifyTourPlace({ title: '음악분수', lclsSystm1: 'NA' }),
    [],
  );
  assert.deepEqual(classifyTourPlace({ title: '음악 공연장' }), ['음악']);
});

test('contentId override is authoritative and follows category order', () => {
  const categories = classifyTourPlace(
    { contentid: '123', title: '분류 불가능 장소' },
    {
      contentIdOverrides: {
        123: ['커피·카페', '문학', '존재하지 않는 분류'],
      },
    },
  );

  assert.deepEqual(categories, ['문학', '커피·카페']);
  assert.ok(categories.every(category => CULTURE_CATEGORIES.includes(category)));
});

test('keeps unmapped places without forcing a culture', () => {
  assert.deepEqual(
    classifyTourPlace({ title: '일반 관광 안내소', lclsSystm1: 'NA' }),
    [],
  );
});
