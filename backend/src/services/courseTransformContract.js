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

function courseTrackIds(course) {
  return (course.tracks || []).map(track =>
    (track.places || []).map(place => String(place.contentId)),
  );
}

function equalIds(left, right) {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

function validatePlannedEdit(original, changedCourse, editPlan) {
  const operation = editPlan?.operation;
  const targetIds = [...new Set(Array.isArray(editPlan?.targetContentIds)
    ? editPlan.targetContentIds.map(String)
    : [])];
  if (!['remove', 'move_day', 'reorder'].includes(operation) || targetIds.length === 0) {
    throw new Error('AI 코스 변경에는 검증 가능한 편집 계획이 필요합니다.');
  }

  const originalTracks = courseTrackIds(original);
  const changedTracks = courseTrackIds(changedCourse);
  if (changedTracks.length !== originalTracks.length) {
    throw new Error('AI가 요청하지 않은 Day 구성을 변경했습니다.');
  }
  const originalIds = originalTracks.flat();
  const changedIds = changedTracks.flat();
  const originalSet = new Set(originalIds);
  const changedSet = new Set(changedIds);
  if (targetIds.some(id => !originalSet.has(id))) {
    throw new Error('AI 편집 계획에 현재 코스에 없는 장소가 있습니다.');
  }
  const targetSet = new Set(targetIds);
  const removedIds = originalIds.filter(id => !changedSet.has(id));
  const titleById = new Map((original.tracks || []).flatMap(track =>
    (track.places || []).map(place => [String(place.contentId), String(place.title || '')]),
  ));
  const targetTitles = targetIds.map(id => titleById.get(id) || id).join(', ');

  if (operation === 'remove') {
    if (!equalIds(removedIds, targetIds)) {
      throw new Error('AI가 사용자가 지정하지 않은 장소를 삭제했습니다.');
    }
    for (let index = 0; index < originalTracks.length; index += 1) {
      const expected = originalTracks[index].filter(id => !targetSet.has(id));
      if (!equalIds(changedTracks[index], expected)) {
        throw new Error('AI가 삭제 외의 Day 또는 순서를 변경했습니다.');
      }
    }
    return `${targetTitles}을(를) 코스에서 제외한 변경안입니다.`;
  }

  if (removedIds.length > 0 || changedIds.length !== originalIds.length) {
    throw new Error('AI가 이동 또는 순서 변경 중 장소를 삭제했습니다.');
  }
  for (let index = 0; index < originalTracks.length; index += 1) {
    const originalUntargeted = originalTracks[index].filter(id => !targetSet.has(id));
    const changedUntargeted = changedTracks[index].filter(id => !targetSet.has(id));
    if (!equalIds(originalUntargeted, changedUntargeted)) {
      throw new Error('AI가 사용자가 지정하지 않은 장소의 Day 또는 순서를 변경했습니다.');
    }
  }

  if (operation === 'move_day') {
    const destinationDay = editPlan.destinationDay;
    if (!Number.isSafeInteger(destinationDay) || destinationDay < 1 ||
        destinationDay > changedTracks.length) {
      throw new Error('AI 편집 계획의 목적 Day가 올바르지 않습니다.');
    }
    const destinationTargets = changedTracks[destinationDay - 1]
      .filter(id => targetSet.has(id));
    if (!equalIds(destinationTargets, targetIds)) {
      throw new Error('AI가 지정된 장소를 요청한 Day로 이동하지 않았습니다.');
    }
    const movedAcrossDay = targetIds.some(id =>
      originalTracks.findIndex(track => track.includes(id)) !== destinationDay - 1,
    );
    if (!movedAcrossDay) {
      throw new Error('AI Day 이동 결과가 요청한 이동과 일치하지 않습니다.');
    }
    return `${targetTitles}을(를) Day ${destinationDay}로 옮긴 변경안입니다.`;
  }

  const originalDays = new Set(targetIds.map(id =>
    originalTracks.findIndex(track => track.includes(id)),
  ));
  const changedDays = new Set(targetIds.map(id =>
    changedTracks.findIndex(track => track.includes(id)),
  ));
  if (originalDays.size !== 1 || changedDays.size !== 1 ||
      [...originalDays][0] !== [...changedDays][0]) {
    throw new Error('AI 순서 변경 대상은 같은 Day 안에서만 이동할 수 있습니다.');
  }
  const trackIndex = [...changedDays][0];
  const changedTargets = changedTracks[trackIndex].filter(id => targetSet.has(id));
  if (!equalIds(changedTargets, targetIds)) {
    throw new Error('AI가 지정한 장소들의 상대 순서를 임의로 바꿨습니다.');
  }
  const position = editPlan.destinationPosition;
  const positionedIds = position === 'first'
    ? changedTracks[trackIndex].slice(0, targetIds.length)
    : position === 'last'
      ? changedTracks[trackIndex].slice(-targetIds.length)
      : [];
  if (!['first', 'last'].includes(position) || !equalIds(positionedIds, targetIds)) {
    throw new Error('AI가 지정한 장소를 요청한 순서 위치로 옮기지 않았습니다.');
  }
  return `${targetTitles}을(를) ${position === 'first' ? '첫 번째' : '마지막'} 순서로 옮긴 변경안입니다.`;
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
  const verifiedSummary = changed && constraints.editPlan
    ? validatePlannedEdit(original, course, constraints.editPlan)
    : parsed.summary.trim();
  if (parsed.status === 'unchanged' && parsed.warnings.length === 0) {
    throw new Error('변경하지 못한 AI 코스에는 경고 사유가 필요합니다.');
  }

  return {
    course: parsed.status === 'unchanged' ? clone(original) : course,
    status: parsed.status,
    summary: verifiedSummary,
    warnings: parsed.warnings.map(item => item.trim()),
  };
}

module.exports = {
  COURSE_TRANSFORM_SCHEMA,
  validatePlannedEdit,
  normalizeTransformOutput,
  normalizedCourseShape,
};
