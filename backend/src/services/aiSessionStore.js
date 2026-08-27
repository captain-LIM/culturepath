'use strict';

const crypto = require('node:crypto');

const DEFAULT_TTL_MS = 30 * 60 * 1000;
const DEFAULT_MAX_SESSIONS = 1000;

class AiSessionError extends Error {
  constructor(message, status = 404) {
    super(message);
    this.name = 'AiSessionError';
    this.status = status;
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createInitialState(entryContext = {}) {
  return {
    entryType: entryContext.type === 'course' ? 'course' : 'general',
    courseId: Number.isSafeInteger(entryContext.courseId) && entryContext.courseId > 0
      ? entryContext.courseId
      : null,
    regions: [],
    cultures: [],
    preferenceTags: [],
    companions: [],
    dayCount: null,
    recentSources: [],
    coursePlaceIds: [],
    coursePlaces: [],
    lastAction: null,
    pendingDraft: null,
    pendingTransform: null,
  };
}

function createAiSessionStore(options = {}) {
  const clock = options.clock || Date.now;
  const ttlMs = Number.isSafeInteger(options.ttlMs) && options.ttlMs > 0
    ? options.ttlMs
    : DEFAULT_TTL_MS;
  const maxSessions = Number.isSafeInteger(options.maxSessions) && options.maxSessions > 0
    ? options.maxSessions
    : DEFAULT_MAX_SESSIONS;
  const sessions = new Map();

  function now() {
    const value = Number(clock());
    if (!Number.isFinite(value)) throw new TypeError('AI 세션 clock 값이 올바르지 않습니다.');
    return value;
  }

  function evictExpired(timestamp = now()) {
    for (const [id, session] of sessions) {
      if (session.expiresAt <= timestamp) sessions.delete(id);
    }
  }

  function enforceLimit() {
    while (sessions.size >= maxSessions) {
      const oldestId = sessions.keys().next().value;
      sessions.delete(oldestId);
    }
  }

  function create({ userId, entryContext } = {}) {
    const timestamp = now();
    evictExpired(timestamp);
    enforceLimit();
    const id = crypto.randomUUID();
    const session = {
      id,
      userId: String(userId),
      createdAt: timestamp,
      updatedAt: timestamp,
      expiresAt: timestamp + ttlMs,
      state: createInitialState(entryContext),
    };
    sessions.set(id, session);
    return clone(session);
  }

  function get(sessionId, userId) {
    const timestamp = now();
    evictExpired(timestamp);
    const session = sessions.get(String(sessionId || ''));
    if (!session) throw new AiSessionError('AI 대화 세션을 찾을 수 없습니다.', 404);
    if (session.userId !== String(userId)) {
      throw new AiSessionError('AI 대화 세션에 접근할 권한이 없습니다.', 403);
    }
    sessions.delete(session.id);
    session.updatedAt = timestamp;
    session.expiresAt = timestamp + ttlMs;
    sessions.set(session.id, session);
    return clone(session);
  }

  function getOrCreate({ sessionId, userId, entryContext } = {}) {
    return sessionId
      ? get(sessionId, userId)
      : create({ userId, entryContext });
  }

  function update(sessionId, userId, updater) {
    if (typeof updater !== 'function') throw new TypeError('AI 세션 updater가 필요합니다.');
    const session = get(sessionId, userId);
    const nextState = updater(clone(session.state));
    if (!nextState || typeof nextState !== 'object' || Array.isArray(nextState)) {
      throw new TypeError('AI 세션 상태가 올바르지 않습니다.');
    }
    const stored = sessions.get(session.id);
    stored.state = clone(nextState);
    return clone(stored);
  }

  function remove(sessionId, userId) {
    const session = get(sessionId, userId);
    sessions.delete(session.id);
    return true;
  }

  function removeAllForUser(userId) {
    let removed = 0;
    for (const [id, session] of sessions) {
      if (session.userId === String(userId)) {
        sessions.delete(id);
        removed += 1;
      }
    }
    return removed;
  }

  return Object.freeze({
    create,
    evictExpired,
    get,
    getOrCreate,
    remove,
    removeAllForUser,
    size: () => sessions.size,
    update,
  });
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const defaultStore = createAiSessionStore({
  ttlMs: positiveInteger(process.env.AI_SESSION_TTL_SECONDS, DEFAULT_TTL_MS / 1000) * 1000,
  maxSessions: positiveInteger(process.env.AI_SESSION_MAX_SESSIONS, DEFAULT_MAX_SESSIONS),
});

module.exports = {
  AiSessionError,
  DEFAULT_TTL_MS,
  createAiSessionStore,
  defaultStore,
};
