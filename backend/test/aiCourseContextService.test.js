'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  CourseAccessError,
  createAiCourseContextService,
} = require('../src/services/aiCourseContextService');

function courseRow(overrides = {}) {
  return {
    id: 7,
    user_id: 12,
    title: '서버 제목',
    description: '',
    is_public: 0,
    revision: 2,
    ...overrides,
  };
}

function trackRow(overrides = {}) {
  return {
    track_number: 1,
    sequence: 1,
    content_id: '12345',
    place_title: '위조 가능한 저장 제목',
    place_address: '위조 가능한 저장 주소',
    place_category: '위조 가능한 저장 분류',
    place_region: '위조 가능한 저장 지역',
    ...overrides,
  };
}

function trustedPlace(contentId = '12345', overrides = {}) {
  return {
    contentId,
    summary: {
      contentId,
      title: 'TourAPI 캐시 장소',
      address: '통영시',
      category: '문학',
      regionName: '통영',
      tel: '055-000-0000',
      openTime: '09:00',
      ...overrides,
    },
  };
}

function createService(course, tracks, cachedPlaces) {
  let call = 0;
  return createAiCourseContextService({
    pool: {
      async query() {
        call += 1;
        return call === 1 ? [[course]] : [tracks];
      },
    },
    placeRepository: {
      async findPlaces(contentIds) {
        return typeof cachedPlaces === 'function'
          ? cachedPlaces(contentIds)
          : cachedPlaces;
      },
    },
  });
}

test('rehydrates an owner course from trusted TourAPI cache metadata', async () => {
  const service = createService(courseRow(), [trackRow()], [trustedPlace()]);
  const course = await service.loadCourseForTransform(7, 12);

  assert.equal(course.title, '서버 제목');
  assert.equal(course.tracks[0].places[0].title, 'TourAPI 캐시 장소');
  assert.equal(course.tracks[0].places[0].address, '통영시');
  assert.equal(course.isOwner, true);
  assert.equal(course.revision, 2);
  assert.deepEqual(course.tracks.slice(1), [
    { trackNumber: 2, places: [] },
    { trackNumber: 3, places: [] },
  ]);
});

test('keeps deleted-author fork provenance when the source FK is null', async () => {
  const service = createService(courseRow({
    forked_from_course_id: null,
    forked_from_title: 'Deleted original',
    forked_from_author_id: null,
    forked_from_author_deleted: 1,
  }), [trackRow()], [trustedPlace()]);
  const course = await service.loadCourseForTransform(7, 12);

  assert.deepEqual(course.forkedFrom, {
    courseId: 0,
    title: 'Deleted original',
    authorId: 'deleted-user',
    authorDeleted: true,
  });
});

test('rejects access to another user private course before loading tracks', async () => {
  const service = createService(courseRow(), [], []);
  await assert.rejects(
    service.loadCourseForTransform(7, 99),
    error => error instanceof CourseAccessError && error.status === 403,
  );
});

test('requires an explicit Fork before another user can transform a public course', async () => {
  const service = createService(courseRow({ is_public: 1 }), [], []);
  await assert.rejects(
    service.loadCourseForTransform(7, 99),
    error => error instanceof CourseAccessError &&
      error.status === 403 && /Fork/.test(error.message),
  );
});

test('rejects non-TourAPI ids stored in a course', async () => {
  const service = createService(
    courseRow({ is_public: 1 }),
    [trackRow({ content_id: 'new_1' })],
    [],
  );
  await assert.rejects(
    service.loadCourseForTransform(7, 12),
    error => error instanceof CourseAccessError && error.status === 400,
  );
});

test('rejects numeric ids missing from the trusted TourAPI cache', async () => {
  const service = createService(courseRow(), [trackRow()], null);
  await assert.rejects(
    service.loadCourseForTransform(7, 12),
    error => error instanceof CourseAccessError && error.status === 400,
  );
});

test('rejects server-loaded courses that exceed the total place limit', async () => {
  const tracks = Array.from({ length: 51 }, (_, index) => trackRow({
    track_number: Math.floor(index / 10) + 1,
    sequence: (index % 10) + 1,
    content_id: String(10000 + index),
  }));
  const service = createService(courseRow(), tracks, []);
  await assert.rejects(
    service.loadCourseForTransform(7, 12),
    error => error instanceof CourseAccessError && error.status === 400,
  );
});

test('preserves an empty middle Day in the three-Day product contract', async () => {
  const tracks = [
    trackRow({ track_number: 1, content_id: '100' }),
    trackRow({ track_number: 3, content_id: '300' }),
  ];
  const service = createService(
    courseRow(),
    tracks,
    [trustedPlace('100'), trustedPlace('300')],
  );
  const course = await service.loadCourseForTransform(7, 12);
  assert.deepEqual(course.tracks.map(track => ({
    trackNumber: track.trackNumber,
    contentIds: track.places.map(place => place.contentId),
  })), [
    { trackNumber: 1, contentIds: ['100'] },
    { trackNumber: 2, contentIds: [] },
    { trackNumber: 3, contentIds: ['300'] },
  ]);
});
