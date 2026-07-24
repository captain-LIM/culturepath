'use strict';

const pool = require('../config/db');

function parseJson(value, fieldName) {
  if (Buffer.isBuffer(value)) {
    return JSON.parse(value.toString('utf8'));
  }
  if (typeof value === 'string') {
    return JSON.parse(value);
  }
  if (value && typeof value === 'object') {
    return value;
  }
  throw new TypeError(`DataLab 캐시의 ${fieldName} 값이 JSON이 아닙니다.`);
}

function toTimestamp(value) {
  if (value instanceof Date) {
    return value.getTime();
  }
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) {
    throw new TypeError('DataLab 캐시 시각 값이 올바르지 않습니다.');
  }
  return timestamp;
}

function mapRow(row) {
  if (!row) {
    return null;
  }
  return {
    cacheKey: String(row.cache_key),
    operation: String(row.operation),
    request: parseJson(row.request_json, 'request_json'),
    response: parseJson(row.response_json, 'response_json'),
    cachedAt: toTimestamp(row.cached_at),
    expiresAt: toTimestamp(row.expires_at),
  };
}

function createDataLabCacheRepository(options = {}) {
  const database = options.pool || pool;

  return Object.freeze({
    async findQuery(cacheKey) {
      const [rows] = await database.query(
        `SELECT cache_key, operation, request_json, response_json,
                cached_at, expires_at
           FROM data_lab_query_cache
          WHERE cache_key = ?
          LIMIT 1`,
        [cacheKey],
      );
      return mapRow(rows[0]);
    },

    async saveQuery({
      cacheKey,
      operation,
      request,
      response,
      cachedAt,
      expiresAt,
    }) {
      await database.query(
        `INSERT INTO data_lab_query_cache
          (cache_key, operation, request_json, response_json,
           cached_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           operation = VALUES(operation),
           request_json = VALUES(request_json),
           response_json = VALUES(response_json),
           cached_at = VALUES(cached_at),
           expires_at = VALUES(expires_at)`,
        [
          cacheKey,
          operation,
          JSON.stringify(request),
          JSON.stringify(response),
          cachedAt,
          expiresAt,
        ],
      );
    },
  });
}

const defaultRepository = createDataLabCacheRepository();

module.exports = {
  createDataLabCacheRepository,
  findQuery: cacheKey => defaultRepository.findQuery(cacheKey),
  mapRow,
  saveQuery: input => defaultRepository.saveQuery(input),
};
