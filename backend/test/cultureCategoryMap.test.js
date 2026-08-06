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
    classifyTourPlace({ title: '원조 할매국밥', lclsSystm1: 'FD' }),
    ['로컬 미식'],
  );
});

test('no longer force-buckets unmatched food places into 로컬 미식', () => {
  assert.deepEqual(
    classifyTourPlace({ title: '지역 음식점', lclsSystm1: 'FD' }),
    [],
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

test('uses verified lclsSystm3 sub-codes even without a title keyword', () => {
  assert.deepEqual(
    classifyTourPlace({ title: '오션뷰', lclsSystm1: 'VE', lclsSystm2: 'VE07', lclsSystm3: 'VE070600' }),
    ['미술·갤러리'],
  );
  assert.deepEqual(
    classifyTourPlace({ title: '오후의 시간', lclsSystm1: 'VE', lclsSystm2: 'VE06', lclsSystm3: 'VE060100' }),
    ['음악'],
  );
  assert.deepEqual(
    classifyTourPlace({ title: 'CGV', lclsSystm1: 'VE', lclsSystm2: 'VE06', lclsSystm3: 'VE060200' }),
    ['영화·애니메이션'],
  );
  assert.deepEqual(
    classifyTourPlace({ title: '구 벨기에 영사관', lclsSystm1: 'HS', lclsSystm2: 'HS01', lclsSystm3: 'HS011100' }),
    ['근대 문화유산'],
  );
});

test('uses verified lclsSystm2 mid-codes even without a title keyword', () => {
  assert.deepEqual(
    classifyTourPlace({ title: '온기', lclsSystm1: 'FD', lclsSystm2: 'FD05' }),
    ['커피·카페'],
  );
  assert.deepEqual(
    classifyTourPlace({ title: '흙손', lclsSystm1: 'EX', lclsSystm2: 'EX02' }),
    ['공예·공방'],
  );
});

test('does not map unrelated TourAPI sub-codes such as generic museums', () => {
  assert.deepEqual(
    classifyTourPlace({ title: '지역 역사관', lclsSystm1: 'VE', lclsSystm2: 'VE07', lclsSystm3: 'VE070100' }),
    [],
  );
});

test('code-based and keyword-based matches for the same category do not duplicate', () => {
  assert.deepEqual(
    classifyTourPlace({ title: '동네 카페', lclsSystm1: 'FD', lclsSystm2: 'FD05' }),
    ['커피·카페'],
  );
});
