'use strict';

const pool = require('../config/db');
const placeCacheRepository = require('../repositories/placeCacheRepository');

const MAX_TRACKS = 7;
const MAX_PLACES_PER_TRACK = 20;
const MAX_TOTAL_PLACES = 50;

class CourseAccessError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'CourseAccessError';
    this.status = status;
  }
}

function createAiCourseContextService(options = {}) {
  const database = options.pool || pool;
  const places = options.placeRepository || placeCacheRepository;

  async function loadCourseForTransform(courseId, userId) {
  const [[course]] = await database.query(
    `SELECT id, user_id, title, description, is_public,
            forked_from_course_id, forked_from_title, forked_from_author_id
     FROM courses
     WHERE id = ?`,
    [courseId],
  );
  if (!course) throw new CourseAccessError('코스를 찾을 수 없습니다.', 404);

  const isOwner = String(course.user_id) === String(userId);
  if (!course.is_public && !isOwner) {
    throw new CourseAccessError('코스에 접근할 권한이 없습니다.', 403);
  }

  const [rows] = await database.query(
    `SELECT track_number, sequence, content_id, place_title, place_address,
            place_category, place_region
     FROM course_tracks
     WHERE course_id = ?
     ORDER BY track_number, sequence`,
    [courseId],
  );
  if (typeof course.title !== 'string' || !course.title.trim() || course.title.length > 120 ||
      typeof (course.description ?? '') !== 'string' || String(course.description || '').length > 2000 ||
      rows.length < 1 || rows.length > MAX_TOTAL_PLACES) {
    throw new CourseAccessError('AI로 변형할 코스 구성이 올바르지 않습니다.', 400);
  }

  const contentIds = rows.map(row => String(row.content_id || ''));
  if (contentIds.some(contentId => !/^\d+$/.test(contentId)) ||
      new Set(contentIds).size !== contentIds.length) {
    throw new CourseAccessError('검증되지 않은 장소가 포함된 코스는 AI로 변형할 수 없습니다.', 400);
  }
  const cachedPlaces = await places.findPlaces(contentIds);
  if (!cachedPlaces) {
    throw new CourseAccessError('TourAPI 캐시에서 검증되지 않은 장소가 포함되어 있습니다.', 400);
  }
  const trustedById = new Map(cachedPlaces.map(place => [String(place.contentId), place.summary]));

  const byTrack = new Map();
  for (const row of rows) {
    const contentId = String(row.content_id || '');
    const trackNumber = Number(row.track_number);
    if (!Number.isSafeInteger(trackNumber) || trackNumber < 1 || trackNumber > MAX_TRACKS) {
      throw new CourseAccessError('AI로 변형할 Day 구성이 올바르지 않습니다.', 400);
    }
    if (!byTrack.has(trackNumber)) byTrack.set(trackNumber, []);
    if (byTrack.get(trackNumber).length >= MAX_PLACES_PER_TRACK) {
      throw new CourseAccessError('한 Day의 장소 수가 AI 변형 제한을 초과합니다.', 400);
    }
    const trusted = trustedById.get(contentId);
    if (!trusted || typeof trusted.title !== 'string' || !trusted.title.trim() ||
        trusted.title.length > 200) {
      throw new CourseAccessError('TourAPI 캐시의 장소 정보가 올바르지 않습니다.', 400);
    }
    byTrack.get(trackNumber).push({
      contentId,
      title: trusted.title,
      address: String(trusted.address || ''),
      category: String(trusted.category || trusted.cultures?.[0] || ''),
      region: trusted.regionName == null ? null : String(trusted.regionName),
      tel: String(trusted.tel || ''),
      openTime: String(trusted.openTime || ''),
    });
  }
  const tracks = [...byTrack.entries()].map(([trackNumber, places]) => ({
    trackNumber,
    places,
  }));
  if (tracks.length === 0 || tracks.every(track => track.places.length === 0)) {
    throw new CourseAccessError('AI로 변형할 장소가 없습니다.', 400);
  }
  if (tracks.some((track, index) => track.trackNumber !== index + 1)) {
    throw new CourseAccessError('AI로 변형할 Day 구성이 연속적이지 않습니다.', 400);
  }

  return {
    id: Number(course.id),
    title: String(course.title),
    description: String(course.description || ''),
    isPublic: Boolean(course.is_public),
    isOwner,
    forkedFrom: course.forked_from_course_id ? {
      courseId: Number(course.forked_from_course_id),
      title: String(course.forked_from_title || ''),
      authorId: String(course.forked_from_author_id || ''),
    } : null,
    tracks,
  };
  }

  return Object.freeze({ loadCourseForTransform });
}

const defaultService = createAiCourseContextService();

module.exports = {
  CourseAccessError,
  createAiCourseContextService,
  loadCourseForTransform: (...args) => defaultService.loadCourseForTransform(...args),
};
