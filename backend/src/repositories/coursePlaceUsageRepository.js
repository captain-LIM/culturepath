'use strict';

const pool = require('../config/db');

const MAX_CONTENT_IDS = 250;
const DEFAULT_MAX_PENDING_ACQUISITIONS = 4;
const DEFAULT_USAGE_QUERY_TIMEOUT_MS = 1000;

function timeoutError() {
  const error = new Error('공개 코스 장소 사용 횟수 집계 시간이 초과되었습니다.');
  error.code = 'PLACE_USAGE_TIMEOUT';
  return error;
}

function busyError() {
  const error = new Error('공개 코스 장소 사용 횟수 집계 대기열이 가득 찼습니다.');
  error.code = 'PLACE_USAGE_BUSY';
  return error;
}

function acquireConnection(database, timeoutMs, onAcquisitionSettled) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      reject(timeoutError());
    }, timeoutMs);

    Promise.resolve().then(() => database.getConnection()).then(
      connection => {
        onAcquisitionSettled();
        if (settled) {
          connection.release();
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve(connection);
      },
      error => {
        onAcquisitionSettled();
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function queryWithTimeout(connection, query, timeoutMs) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      connection.destroy?.();
      reject(timeoutError());
    }, timeoutMs);

    Promise.resolve().then(() => connection.query({
      sql: query.sql,
      values: query.values,
      timeout: timeoutMs,
    })).then(
      result => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(result);
      },
      error => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function normalizeContentIds(contentIds) {
  if (!Array.isArray(contentIds)) {
    throw new TypeError('장소 사용 횟수 조회 contentIds는 배열이어야 합니다.');
  }

  const normalized = [...new Set(
    contentIds
      .map(contentId => String(contentId ?? '').trim())
      .filter(Boolean),
  )];
  if (normalized.length > MAX_CONTENT_IDS) {
    throw new RangeError(`장소 사용 횟수는 한 번에 최대 ${MAX_CONTENT_IDS}개까지 조회할 수 있습니다.`);
  }
  return normalized;
}

function createCoursePlaceUsageRepository(options = {}) {
  const database = options.pool || pool;
  const maxPendingAcquisitions = options.maxPendingAcquisitions ??
    DEFAULT_MAX_PENDING_ACQUISITIONS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_USAGE_QUERY_TIMEOUT_MS;
  if (!Number.isSafeInteger(maxPendingAcquisitions) ||
      maxPendingAcquisitions < 1 || maxPendingAcquisitions > 50) {
    throw new TypeError('장소 사용 횟수 maxPendingAcquisitions는 1 이상 50 이하의 정수여야 합니다.');
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 5000) {
    throw new TypeError('장소 사용 횟수 timeoutMs는 1 이상 5000 이하의 정수여야 합니다.');
  }
  let pendingAcquisitions = 0;

  async function findPublicCourseCounts(contentIds) {
    const normalizedIds = normalizeContentIds(contentIds);
    if (normalizedIds.length === 0) {
      return new Map();
    }

    const placeholders = normalizedIds.map(() => '?').join(', ');
    if (pendingAcquisitions >= maxPendingAcquisitions) {
      throw busyError();
    }
    pendingAcquisitions += 1;
    const connection = await acquireConnection(
      database,
      timeoutMs,
      () => { pendingAcquisitions -= 1; },
    );
    let queryTimedOut = false;
    let rows;
    try {
      [rows] = await queryWithTimeout(connection, {
        sql: `SELECT ct.content_id,
              COUNT(DISTINCT ct.course_id) AS public_course_count
         FROM course_tracks ct
         JOIN courses c
           ON c.id = ct.course_id
          AND c.is_public = TRUE
        WHERE ct.content_id IN (${placeholders})
        GROUP BY ct.content_id`,
        values: normalizedIds,
      }, timeoutMs);
    } catch (error) {
      queryTimedOut = error?.code === 'PLACE_USAGE_TIMEOUT';
      throw error;
    } finally {
      if (!queryTimedOut) {
        connection.release();
      }
    }

    return new Map(rows.map(row => {
      const count = Number(row.public_course_count);
      if (!Number.isSafeInteger(count) || count < 0) {
        throw new TypeError('공개 코스 장소 사용 횟수가 올바르지 않습니다.');
      }
      return [String(row.content_id), count];
    }));
  }

  return Object.freeze({ findPublicCourseCounts });
}

const defaultRepository = createCoursePlaceUsageRepository();

module.exports = {
  DEFAULT_MAX_PENDING_ACQUISITIONS,
  DEFAULT_USAGE_QUERY_TIMEOUT_MS,
  MAX_CONTENT_IDS,
  createCoursePlaceUsageRepository,
  findPublicCourseCounts: contentIds =>
    defaultRepository.findPublicCourseCounts(contentIds),
  normalizeContentIds,
};
