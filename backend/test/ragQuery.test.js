'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { normalizeRagQuery, routeQuery } = require('../src/services/ragQuery');

test('normalizes query text and deterministically extracts curated filters', () => {
  const routed = routeQuery('  통영\u200B에서   책방  ');
  assert.equal(routed.normalizedQuery, '통영 에서 책방');
  assert.equal(routed.region, '통영');
  assert.equal(routed.areaCode, 'tongyeong');
  assert.equal(routed.category, '독립서점·책방');
  assert.deepEqual(routed.softConditions, []);
});

test('keeps unsupported soft conditions out of hard filters', () => {
  const routed = routeQuery('비 오는 날 부모님과 걷기 편한 통영 코스');
  assert.equal(routed.region, '통영');
  assert.equal(routed.category, null);
  assert.deepEqual(routed.softConditions, ['indoor', 'low-mobility', 'family']);
});

test('accepts only explicit allowlisted content types and curated overrides', () => {
  const routed = routeQuery('서울에서 둘러볼 곳', {
    category: '미술·갤러리',
    contentTypeId: '14',
    region: 'gangneung',
  });
  assert.equal(routed.region, '강릉');
  assert.equal(routed.category, '미술·갤러리');
  assert.equal(routed.contentTypeId, '14');
  assert.throws(() => routeQuery('검색', { contentTypeId: '999' }), /콘텐츠 유형/);
  assert.throws(() => routeQuery('검색', { category: '임의 분류' }), /문화 필터/);
});

test('rejects empty and overlong normalized queries', () => {
  assert.throws(() => normalizeRagQuery(' \u200B '), /1자 이상/);
  assert.throws(() => normalizeRagQuery('가'.repeat(501)), /500자 이하/);
});
