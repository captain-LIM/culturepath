'use strict';

const ragPipeline = require('../services/ragPipeline');
const { loadCourseForTransform } = require('../services/aiCourseContextService');
const { normalizedCourseShape } = require('../services/courseTransformContract');

const MAX_MESSAGES = 20;
const MAX_MESSAGE_LENGTH = 2000;
const MAX_TOTAL_MESSAGE_LENGTH = 8000;
const MAX_REQUEST_LENGTH = 500;
const MAX_TRACKS = 3;
const MAX_PLACES_PER_TRACK = 20;
const MAX_TOTAL_PLACES = 50;

function validateMessages(messages) {
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > MAX_MESSAGES) {
    return `messages는 1~${MAX_MESSAGES}개여야 합니다.`;
  }
  let totalLength = 0;
  for (const message of messages) {
    if (!message || !['user', 'assistant'].includes(message.role) ||
        typeof message.content !== 'string' || !message.content.trim() ||
        message.content.length > MAX_MESSAGE_LENGTH) {
      return '각 message는 허용된 role과 길이 제한을 만족하는 content가 필요합니다.';
    }
    totalLength += message.content.length;
  }
  if (totalLength > MAX_TOTAL_MESSAGE_LENGTH) {
    return '전체 대화 내용이 너무 깁니다.';
  }
  return null;
}

function validateCourse(course) {
  if (!course || typeof course !== 'object' || Array.isArray(course)) {
    return 'course 객체가 필요합니다.';
  }
  if (typeof course.title !== 'string' || !course.title.trim() || course.title.length > 120 ||
      typeof (course.description ?? '') !== 'string' || String(course.description || '').length > 2000 ||
      !Array.isArray(course.tracks) || course.tracks.length < 1 || course.tracks.length > MAX_TRACKS) {
    return 'course의 제목, 설명 또는 Day 구성이 올바르지 않습니다.';
  }
  let totalPlaces = 0;
  const trackNumbers = new Set();
  const contentIds = new Set();
  for (const track of course.tracks) {
    if (!Number.isSafeInteger(track?.trackNumber) || track.trackNumber < 1 || track.trackNumber > MAX_TRACKS ||
        trackNumbers.has(track.trackNumber) || !Array.isArray(track.places) ||
        track.places.length > MAX_PLACES_PER_TRACK) {
      return 'course의 Day 항목이 올바르지 않습니다.';
    }
    trackNumbers.add(track.trackNumber);
    totalPlaces += track.places.length;
    for (const place of track.places) {
      if (!place || typeof place.contentId !== 'string' || !place.contentId.trim() ||
          place.contentId.length > 100 || typeof place.title !== 'string' ||
          !place.title.trim() || place.title.length > 200 ||
          contentIds.has(place.contentId)) {
        return 'course에 올바르지 않은 장소가 포함되어 있습니다.';
      }
      contentIds.add(place.contentId);
    }
  }
  if (totalPlaces < 1 || totalPlaces > MAX_TOTAL_PLACES) {
    return `course 장소는 1~${MAX_TOTAL_PLACES}개여야 합니다.`;
  }
  return null;
}

function normalizeConstraints(value) {
  if (value == null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) return null;
  const allowed = new Set(['days', 'weather', 'companions', 'mobility', 'dietary', 'startRegion']);
  if (Object.keys(value).some(key => !allowed.has(key)) || JSON.stringify(value).length > 2000) {
    return null;
  }
  if (value.days != null &&
      (!Number.isSafeInteger(value.days) || value.days < 1 || value.days > MAX_TRACKS)) return null;
  for (const key of ['weather', 'mobility', 'startRegion']) {
    if (value[key] != null && (typeof value[key] !== 'string' || value[key].length > 100)) return null;
  }
  for (const key of ['companions', 'dietary']) {
    if (value[key] != null && (!Array.isArray(value[key]) || value[key].length > 10 ||
        value[key].some(item => typeof item !== 'string' || item.length > 100))) return null;
  }
  return value;
}

function providerStatus(error) {
  if (error?.name === 'CourseAccessError') return error.status;
  if (error?.code?.includes('NOT_CONFIGURED')) return 503;
  if (error?.code?.includes('TIMEOUT')) return 504;
  if (error?.name === 'AiProviderError' || error?.name === 'VectorStoreError') return 502;
  if (error instanceof SyntaxError || String(error?.message || '').startsWith('AI ')) return 502;
  return 500;
}

async function transformCourse(req, res) {
  const submittedCourse = req.body?.course;
  const courseId = req.body?.courseId ?? submittedCourse?.id;
  const request = req.body?.request ?? req.body?.userRequest;
  const constraints = normalizeConstraints(req.body?.constraints);
  if (!Number.isSafeInteger(courseId) || courseId <= 0) {
    return res.status(400).json({ message: '유효한 courseId가 필요합니다.' });
  }
  if (submittedCourse != null) {
    const courseError = validateCourse(submittedCourse);
    if (courseError) return res.status(400).json({ message: courseError });
  }
  if (typeof request !== 'string' || !request.trim() || request.length > MAX_REQUEST_LENGTH) {
    return res.status(400).json({ message: `request는 1~${MAX_REQUEST_LENGTH}자여야 합니다.` });
  }
  if (constraints == null) {
    return res.status(400).json({ message: 'constraints가 올바르지 않습니다.' });
  }

  const startedAt = Date.now();
  try {
    const course = await loadCourseForTransform(courseId, req.user.id);
    const result = await ragPipeline.editCourse(course, request.trim(), constraints);
    const changed = JSON.stringify(normalizedCourseShape(result.course)) !==
      JSON.stringify(normalizedCourseShape(course));
    console.info('AI 코스 변형 완료:', {
      changed,
      warningCount: result.warnings?.length || 0,
      sourceCount: result.sources?.length || 0,
      model: result.usage?.model || 'unknown',
      inputTokens: result.usage?.inputTokens || 0,
      outputTokens: result.usage?.outputTokens || 0,
      durationMs: Date.now() - startedAt,
      mock: Boolean(result.mock),
    });
    return res.json(result);
  } catch (error) {
    console.error('AI 코스 변형 실패:', { errorName: error?.name || 'Error', code: error?.code || null });
    const status = providerStatus(error);
    const message = error?.name === 'CourseAccessError'
      ? error.message
      : 'AI 코스 변형에 실패했습니다.';
    return res.status(status).json({ message });
  }
}

async function chat(req, res) {
  const messages = req.body?.messages;
  const validationError = validateMessages(messages);
  if (validationError) return res.status(400).json({ message: validationError });

  try {
    const result = await ragPipeline.chat(messages);
    return res.json(result);
  } catch (error) {
    console.error('AI 응답 실패:', { errorName: error?.name || 'Error', code: error?.code || null });
    return res.status(providerStatus(error)).json({ message: 'AI 응답 생성에 실패했습니다.' });
  }
}

module.exports = {
  chat,
  normalizeConstraints,
  transformCourse,
  validateCourse,
  validateMessages,
};
