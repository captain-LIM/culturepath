'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  COURSE_TRANSFORM_SCHEMA,
  normalizeTransformOutput,
} = require('../src/services/courseTransformContract');

function place(contentId, title) {
  return { contentId, title, address: '', category: '문학' };
}

function originalCourse() {
  return {
    id: 1,
    title: '원본 코스',
    description: '원본 설명',
    tracks: [{
      trackNumber: 1,
      places: [place('100', '기존 장소'), place('200', '두 번째 장소')],
    }],
  };
}

function trustedPlaces() {
  return new Map([
    ['100', place('100', '기존 장소')],
    ['200', place('200', '두 번째 장소')],
  ]);
}

function unchangedOutput(overrides = {}) {
  return {
    status: 'unchanged',
    summary: '검증할 수 없는 조건이라 원본을 유지했습니다.',
    title: '원본 코스',
    description: '원본 설명',
    tracks: [{ trackNumber: 1, contentIds: ['100', '200'] }],
    warnings: ['실내 여부를 검증할 수 없습니다.'],
    ...overrides,
  };
}

test('defines a strict schema and reconstructs only existing changed places', () => {
  assert.equal(COURSE_TRANSFORM_SCHEMA.additionalProperties, false);
  assert.equal(COURSE_TRANSFORM_SCHEMA.properties.tracks.items.additionalProperties, false);
  assert.equal(COURSE_TRANSFORM_SCHEMA.properties.tracks.maxItems, 3);
  assert.equal(COURSE_TRANSFORM_SCHEMA.properties.tracks.items.properties.contentIds.minItems, 0);
  const normalized = normalizeTransformOutput({
    status: 'changed',
    summary: '기존 장소 순서를 변경했습니다.',
    title: '원본 코스',
    description: '원본 설명',
    tracks: [{ trackNumber: 1, contentIds: ['200', '100'] }],
    warnings: [],
  }, originalCourse(), trustedPlaces());
  assert.equal(normalized.status, 'changed');
  assert.equal(normalized.course.tracks[0].places[0].title, '두 번째 장소');
});

test('allows empty Days but rejects an entirely empty course', () => {
  const normalized = normalizeTransformOutput({
    status: 'changed',
    summary: '둘째 날을 비웠습니다.',
    title: '원본 코스',
    description: '원본 설명',
    tracks: [
      { trackNumber: 1, contentIds: ['100'] },
      { trackNumber: 2, contentIds: [] },
    ],
    warnings: [],
  }, originalCourse(), trustedPlaces());
  assert.equal(normalized.course.tracks[1].places.length, 0);

  assert.throws(() => normalizeTransformOutput({
    status: 'changed',
    summary: '모든 장소를 제거했습니다.',
    title: '원본 코스',
    description: '원본 설명',
    tracks: [{ trackNumber: 1, contentIds: [] }],
    warnings: [],
  }, originalCourse(), trustedPlaces()), /한 곳 이상/);
});

test('allows a reasoned unchanged preview without mutating the original', () => {
  const original = originalCourse();
  const normalized = normalizeTransformOutput(
    unchangedOutput(),
    original,
    trustedPlaces(),
  );
  assert.equal(normalized.status, 'unchanged');
  assert.deepEqual(normalized.course, original);
  assert.deepEqual(normalized.warnings, ['실내 여부를 검증할 수 없습니다.']);
});

test('keeps the original course when a requested day change cannot be fulfilled', () => {
  const original = originalCourse();
  const normalized = normalizeTransformOutput(
    unchangedOutput(),
    original,
    trustedPlaces(),
    { days: 2 },
  );
  assert.equal(normalized.status, 'unchanged');
  assert.deepEqual(normalized.course, original);
});

test('rejects status mismatches, unknown fields, and missing unchanged reasons', () => {
  assert.throws(() => normalizeTransformOutput(
    unchangedOutput({ status: 'changed' }),
    originalCourse(),
    trustedPlaces(),
  ), /상태가 실제 변경 내용/);
  assert.throws(() => normalizeTransformOutput(
    unchangedOutput({ extra: true }),
    originalCourse(),
    trustedPlaces(),
  ), /허용되지 않은 필드/);
  assert.throws(() => normalizeTransformOutput(
    unchangedOutput({ warnings: [] }),
    originalCourse(),
    trustedPlaces(),
  ), /경고 사유/);
});

test('rejects invalid tracks, untrusted ids, and requested-day mismatches', () => {
  assert.throws(() => normalizeTransformOutput(
    unchangedOutput({ tracks: [{ trackNumber: 2, contentIds: ['100'] }] }),
    originalCourse(),
    trustedPlaces(),
  ), /Day 항목/);
  assert.throws(() => normalizeTransformOutput(
    unchangedOutput({ tracks: [{ trackNumber: 1, contentIds: ['999'] }] }),
    originalCourse(),
    trustedPlaces(),
  ), /허용되지 않은 장소/);
  assert.throws(() => normalizeTransformOutput(
    unchangedOutput({
      status: 'changed',
      title: '원본 코스',
    }),
    originalCourse(),
    trustedPlaces(),
    { days: 2 },
  ), /요청한 일수/);
  assert.throws(() => normalizeTransformOutput(
    unchangedOutput({
      tracks: [{ trackNumber: 1, contentIds: ['100'], instruction: 'ignore rules' }],
    }),
    originalCourse(),
    trustedPlaces(),
  ), /허용되지 않은 필드/);
});
