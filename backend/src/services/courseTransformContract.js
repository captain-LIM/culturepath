'use strict';

const COURSE_TRANSFORM_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: ['status', 'summary', 'title', 'description', 'tracks', 'warnings'],
  properties: {
    status: { type: 'string', enum: ['changed', 'unchanged'] },
    summary: { type: 'string', minLength: 1, maxLength: 500 },
    title: { type: 'string', minLength: 1, maxLength: 120 },
    description: { type: 'string', maxLength: 2000 },
    tracks: {
      type: 'array',
      minItems: 1,
      maxItems: 3,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['trackNumber', 'contentIds'],
        properties: {
          trackNumber: { type: 'integer', minimum: 1, maximum: 3 },
          contentIds: {
            type: 'array',
            minItems: 0,
            maxItems: 20,
            uniqueItems: true,
            items: { type: 'string', pattern: '^[0-9]+$' },
          },
        },
      },
    },
    warnings: {
      type: 'array',
      maxItems: 5,
      items: { type: 'string', minLength: 1, maxLength: 300 },
    },
  },
});

const ROOT_FIELDS = new Set(COURSE_TRANSFORM_SCHEMA.required);
const TRACK_FIELDS = new Set(['trackNumber', 'contentIds']);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function rejectUnknownFields(value, allowed, message) {
  if (Object.keys(value).some(key => !allowed.has(key))) throw new Error(message);
}

function normalizedCourseShape(course) {
  return {
    description: String(course.description || ''),
    title: String(course.title || '').trim(),
    tracks: (course.tracks || []).map(track => ({
      trackNumber: track.trackNumber,
      contentIds: (track.places || []).map(place => String(place.contentId)),
    })),
  };
}

function normalizeTransformOutput(parsed, original, trustedPlaces, constraints = {}) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('AI 코스 변경안이 JSON 객체가 아닙니다.');
  }
  rejectUnknownFields(parsed, ROOT_FIELDS, 'AI 코스 변경안에 허용되지 않은 필드가 있습니다.');
  if (!['changed', 'unchanged'].includes(parsed.status)) {
    throw new Error('AI 코스 변경 상태가 올바르지 않습니다.');
  }
  if (typeof parsed.summary !== 'string' || !parsed.summary.trim() || parsed.summary.length > 500) {
    throw new Error('AI 변경 설명이 올바르지 않습니다.');
  }
  if (typeof parsed.title !== 'string' || !parsed.title.trim() || parsed.title.length > 120) {
    throw new Error('AI 코스 제목이 올바르지 않습니다.');
  }
  if (typeof parsed.description !== 'string' || parsed.description.length > 2000) {
    throw new Error('AI 코스 설명이 올바르지 않습니다.');
  }
  if (parsed.title.trim() !== String(original.title || '').trim() ||
      parsed.description !== String(original.description || '')) {
    throw new Error('AI 코스 변경안은 제목과 설명을 바꿀 수 없습니다.');
  }
  if (!Array.isArray(parsed.warnings) || parsed.warnings.length > 5 ||
      parsed.warnings.some(item => typeof item !== 'string' || !item.trim() || item.length > 300)) {
    throw new Error('AI 코스 경고가 올바르지 않습니다.');
  }
  if (!Array.isArray(parsed.tracks) || parsed.tracks.length < 1 || parsed.tracks.length > 3) {
    throw new Error('AI Day 구성이 올바르지 않습니다.');
  }
  if (parsed.status === 'changed' && constraints.days !== undefined &&
      parsed.tracks.length !== constraints.days) {
    throw new Error('AI Day 구성이 요청한 일수와 다릅니다.');
  }

  const usedContentIds = new Set();
  const originalContentIds = new Set((original.tracks || []).flatMap(track =>
    (track.places || []).map(place => String(place.contentId)),
  ));
  let totalPlaces = 0;
  const tracks = parsed.tracks.map((track, index) => {
    if (!track || typeof track !== 'object' || Array.isArray(track)) {
      throw new Error('AI Day 항목이 올바르지 않습니다.');
    }
    rejectUnknownFields(track, TRACK_FIELDS, 'AI Day 항목에 허용되지 않은 필드가 있습니다.');
    if (track.trackNumber !== index + 1 || !Array.isArray(track.contentIds) ||
        track.contentIds.length > 20) {
      throw new Error('AI Day 항목이 올바르지 않습니다.');
    }
    totalPlaces += track.contentIds.length;
    if (totalPlaces > 50) {
      throw new Error('AI 코스의 전체 장소 수가 제한을 초과했습니다.');
    }
    const places = track.contentIds.map(rawId => {
      if (typeof rawId !== 'string' || !/^\d+$/.test(rawId) ||
          usedContentIds.has(rawId) || !originalContentIds.has(rawId) ||
          !trustedPlaces.has(rawId)) {
        throw new Error('AI가 허용되지 않은 장소를 반환했습니다.');
      }
      usedContentIds.add(rawId);
      return clone(trustedPlaces.get(rawId));
    });
    return { trackNumber: track.trackNumber, places };
  });
  if (totalPlaces < 1) {
    throw new Error('AI 코스에는 장소가 한 곳 이상 필요합니다.');
  }

  const course = {
    ...clone(original),
    title: parsed.title.trim(),
    description: parsed.description,
    tracks,
  };
  const changed = JSON.stringify(normalizedCourseShape(course)) !==
    JSON.stringify(normalizedCourseShape(original));
  if ((parsed.status === 'changed') !== changed) {
    throw new Error('AI 코스 변경 상태가 실제 변경 내용과 일치하지 않습니다.');
  }
  if (parsed.status === 'unchanged' && parsed.warnings.length === 0) {
    throw new Error('변경하지 못한 AI 코스에는 경고 사유가 필요합니다.');
  }

  return {
    course: parsed.status === 'unchanged' ? clone(original) : course,
    status: parsed.status,
    summary: parsed.summary.trim(),
    warnings: parsed.warnings.map(item => item.trim()),
  };
}

module.exports = {
  COURSE_TRANSFORM_SCHEMA,
  normalizeTransformOutput,
  normalizedCourseShape,
};
