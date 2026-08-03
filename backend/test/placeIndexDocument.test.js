'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  DOCUMENT_VERSION,
  buildPlaceIndexDocument,
  createPointId,
  resolveCatalogRegion,
} = require('../src/services/placeIndexDocument');

function cachedPlace(overrides = {}) {
  return {
    contentId: '2390314',
    summary: {
      contentId: '2390314',
      contentTypeId: '14',
      title: '박경리기념관',
      address: '경남 통영시 산양읍',
      lDongRegnCd: '48',
      lDongSignguCd: '220',
      cultures: ['문학', '문학'],
      sourceUpdatedAt: '20260801093000',
      tel: '055-000-0000',
    },
    detail: {
      overview: '박경리 작가의 작품 세계를 소개하는 공간입니다.',
      openTime: '09:00~18:00',
      restDate: '월요일',
    },
    ...overrides,
  };
}

test('builds one deterministic, filterable document per trusted TourAPI place', () => {
  const first = buildPlaceIndexDocument(cachedPlace());
  const second = buildPlaceIndexDocument(cachedPlace());

  assert.equal(first.pointId, second.pointId);
  assert.match(first.pointId, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(first.documentHash, second.documentHash);
  assert.match(first.content, /장소명: 박경리기념관/);
  assert.match(first.content, /소개: 박경리 작가/);
  assert.equal(first.payload.areaCode, 'tongyeong');
  assert.equal(first.payload.regionName, '통영');
  assert.deepEqual(first.payload.cultures, ['문학']);
  assert.equal(first.payload.documentVersion, DOCUMENT_VERSION);
});

test('changes the document hash when searchable detail changes', () => {
  const original = buildPlaceIndexDocument(cachedPlace());
  const changed = buildPlaceIndexDocument(cachedPlace({
    detail: { overview: '새로운 소개', openTime: '10:00~17:00' },
  }));
  assert.notEqual(original.documentHash, changed.documentHash);
  const changedPhone = buildPlaceIndexDocument(cachedPlace({
    summary: { ...cachedPlace().summary, tel: '055-111-2222' },
  }));
  assert.notEqual(original.documentHash, changedPhone.documentHash);
});

test('resolves only unambiguous curated region codes and validates required fields', () => {
  assert.equal(resolveCatalogRegion('48', '220').areaCode, 'tongyeong');
  assert.equal(resolveCatalogRegion('52', ''), null);
  assert.equal(resolveCatalogRegion('11', null).areaCode, 'seoul');
  assert.equal(createPointId('2390314'), createPointId('2390314'));
  assert.throws(() => buildPlaceIndexDocument({ summary: {} }), /contentId와 title/);
});
