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

test('accepts only the exact planned removal and generates the summary from the verified diff', () => {
  const normalized = normalizeTransformOutput({
    status: 'changed',
    summary: '모델이 작성한 신뢰하지 않는 설명',
    title: '원본 코스',
    description: '원본 설명',
    tracks: [{ trackNumber: 1, contentIds: ['100'] }],
    warnings: [],
  }, originalCourse(), trustedPlaces(), {
    editPlan: {
      operation: 'remove',
      targetContentIds: ['200'],
      destinationDay: null,
      destinationPosition: 'none',
    },
  });
  assert.deepEqual(normalized.course.tracks[0].places.map(item => item.contentId), ['100']);
  assert.match(normalized.summary, /두 번째 장소/);
  assert.doesNotMatch(normalized.summary, /신뢰하지 않는/);

  assert.throws(() => normalizeTransformOutput({
    status: 'changed',
    summary: '잘못된 대상을 삭제했습니다.',
    title: '원본 코스',
    description: '원본 설명',
    tracks: [{ trackNumber: 1, contentIds: ['100'] }],
    warnings: [],
  }, originalCourse(), trustedPlaces(), {
    editPlan: {
      operation: 'remove',
      targetContentIds: ['100'],
      destinationDay: null,
      destinationPosition: 'none',
    },
  }), /지정하지 않은 장소/);
});

test('rejects extra reorder while removing and validates explicit Day moves', () => {
  const original = {
    id: 1,
    title: '원본 코스',
    description: '원본 설명',
    tracks: [
      { trackNumber: 1, places: [place('100', '첫 장소'), place('200', '둘째 장소'), place('300', '셋째 장소')] },
      { trackNumber: 2, places: [place('400', '넷째 장소')] },
    ],
  };
  const trusted = new Map(original.tracks.flatMap(track =>
    track.places.map(item => [item.contentId, item]),
  ));
  assert.throws(() => normalizeTransformOutput({
    status: 'changed',
    summary: '삭제와 다른 변경을 섞었습니다.',
    title: '원본 코스',
    description: '원본 설명',
    tracks: [
      { trackNumber: 1, contentIds: ['300', '100'] },
      { trackNumber: 2, contentIds: ['400'] },
    ],
    warnings: [],
  }, original, trusted, {
    editPlan: { operation: 'remove', targetContentIds: ['200'] },
  }), /삭제 외/);

  const moved = normalizeTransformOutput({
    status: 'changed',
    summary: '장소를 이동했습니다.',
    title: '원본 코스',
    description: '원본 설명',
    tracks: [
      { trackNumber: 1, contentIds: ['100', '300'] },
      { trackNumber: 2, contentIds: ['400', '200'] },
    ],
    warnings: [],
  }, original, trusted, {
    editPlan: {
      operation: 'move_day',
      targetContentIds: ['200'],
      destinationDay: 2,
      destinationPosition: 'none',
    },
  });
  assert.deepEqual(moved.course.tracks[1].places.map(item => item.contentId), ['400', '200']);
});

test('validates that only the named place moves to the requested order position', () => {
  const normalized = normalizeTransformOutput({
    status: 'changed',
    summary: '순서를 바꿨습니다.',
    title: '원본 코스',
    description: '원본 설명',
    tracks: [{ trackNumber: 1, contentIds: ['200', '100'] }],
    warnings: [],
  }, originalCourse(), trustedPlaces(), {
    editPlan: {
      operation: 'reorder',
      targetContentIds: ['200'],
      destinationDay: null,
      destinationPosition: 'first',
    },
  });
  assert.equal(normalized.course.tracks[0].places[0].contentId, '200');
  assert.match(normalized.summary, /첫 번째/);
});
