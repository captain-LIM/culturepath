'use strict';

const pool = require('../config/db');
const { createPlaceSummary } = require('../models/placeSummary');

const PLACE_COLUMNS = `
  content_id,
  summary_json,
  detail_json,
  summary_cached_at,
  summary_expires_at,
  detail_cached_at,
  detail_expires_at
`;

function parseJson(value, fieldName) {
  if (value === null || value === undefined) {
    return null;
  }
  if (Buffer.isBuffer(value)) {
    return JSON.parse(value.toString('utf8'));
  }
  if (typeof value === 'string') {
    return JSON.parse(value);
  }
  if (typeof value === 'object') {
    return value;
  }
  throw new TypeError(`캐시의 ${fieldName} 값이 JSON이 아닙니다.`);
}

function toTimestamp(value) {
  if (value instanceof Date) {
    return value.getTime();
  }
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) {
    throw new TypeError('캐시 시각 값이 올바르지 않습니다.');
  }
  return timestamp;
}

function mapPlaceRow(row) {
  if (!row) {
    return null;
  }

  return {
    contentId: String(row.content_id),
    summary: parseJson(row.summary_json, 'summary_json'),
    detail: parseJson(row.detail_json, 'detail_json'),
    summaryCachedAt: toTimestamp(row.summary_cached_at),
    summaryExpiresAt: toTimestamp(row.summary_expires_at),
    detailCachedAt:
      row.detail_cached_at === null ? null : toTimestamp(row.detail_cached_at),
    detailExpiresAt:
      row.detail_expires_at === null ? null : toTimestamp(row.detail_expires_at),
  };
}

function summaryValues(place, cachedAt, expiresAt) {
  return [
    place.contentId,
    place.contentTypeId,
    place.title,
    place.lDongRegnCd,
    place.lDongSignguCd,
    JSON.stringify(place.cultures || []),
    JSON.stringify(place),
    place.sourceUpdatedAt,
    cachedAt,
    expiresAt,
  ];
}

function createPlaceCacheRepository(options = {}) {
  const database = options.pool || pool;

  async function findPlace(contentId) {
    const [rows] = await database.query(
      `SELECT ${PLACE_COLUMNS}
         FROM places_cache
        WHERE content_id = ?
        LIMIT 1`,
      [contentId],
    );
    return mapPlaceRow(rows[0]);
  }

  async function findPlaces(contentIds) {
    if (!contentIds.length) {
      return [];
    }

    const placeholders = contentIds.map(() => '?').join(', ');
    const [rows] = await database.query(
      `SELECT ${PLACE_COLUMNS}
         FROM places_cache
        WHERE content_id IN (${placeholders})`,
      contentIds,
    );
    const placesById = new Map(
      rows.map(row => {
        const place = mapPlaceRow(row);
        return [place.contentId, place];
      }),
    );

    const ordered = contentIds.map(contentId => placesById.get(contentId));
    return ordered.some(place => !place) ? null : ordered;
  }

  async function findQuery(cacheKey) {
    const [rows] = await database.query(
      `SELECT cache_key, operation, request_json, content_ids_json,
              pagination_json, cached_at, expires_at
         FROM place_query_cache
        WHERE cache_key = ?
        LIMIT 1`,
      [cacheKey],
    );
    const row = rows[0];
    if (!row) {
      return null;
    }

    const contentIds = parseJson(row.content_ids_json, 'content_ids_json');
    if (!Array.isArray(contentIds)) {
      throw new TypeError('캐시의 content_ids_json 값이 배열이 아닙니다.');
    }
    const normalizedIds = contentIds.map(String);
    const placeRows = await findPlaces(normalizedIds);
    if (!placeRows) {
      return null;
    }

    return {
      cacheKey: String(row.cache_key),
      operation: String(row.operation),
      request: parseJson(row.request_json, 'request_json'),
      items: placeRows.map(place => place.summary),
      pagination: parseJson(row.pagination_json, 'pagination_json'),
      cachedAt: toTimestamp(row.cached_at),
      expiresAt: toTimestamp(row.expires_at),
    };
  }

  async function saveQuery({
    cacheKey,
    operation,
    request,
    items,
    pagination,
    cachedAt,
    expiresAt,
  }) {
    const connection = await database.getConnection();
    try {
      await connection.beginTransaction();

      if (items.length) {
        const rowPlaceholder = '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
        const placeholders = items.map(() => rowPlaceholder).join(', ');
        const values = items.flatMap(item =>
          summaryValues(item, cachedAt, expiresAt),
        );
        await connection.query(
          `INSERT INTO places_cache (
             content_id, content_type_id, title, l_dong_regn_cd,
             l_dong_signgu_cd, cultures_json, summary_json,
             source_updated_at, summary_cached_at, summary_expires_at
           )
           VALUES ${placeholders}
           ON DUPLICATE KEY UPDATE
             content_type_id = VALUES(content_type_id),
             title = VALUES(title),
             l_dong_regn_cd = VALUES(l_dong_regn_cd),
             l_dong_signgu_cd = VALUES(l_dong_signgu_cd),
             cultures_json = VALUES(cultures_json),
             summary_json = VALUES(summary_json),
             source_updated_at = VALUES(source_updated_at),
             summary_cached_at = VALUES(summary_cached_at),
             summary_expires_at = VALUES(summary_expires_at)`,
          values,
        );
      }

      await connection.query(
        `INSERT INTO place_query_cache (
           cache_key, operation, request_json, content_ids_json,
           pagination_json, cached_at, expires_at
         )
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           operation = VALUES(operation),
           request_json = VALUES(request_json),
           content_ids_json = VALUES(content_ids_json),
           pagination_json = VALUES(pagination_json),
           cached_at = VALUES(cached_at),
           expires_at = VALUES(expires_at)`,
        [
          cacheKey,
          operation,
          JSON.stringify(request),
          JSON.stringify(items.map(item => item.contentId)),
          JSON.stringify(pagination),
          cachedAt,
          expiresAt,
        ],
      );

      await connection.commit();
    } catch (error) {
      try {
        await connection.rollback();
      } catch {
        // 원래 저장 오류를 보존한다.
      }
      throw error;
    } finally {
      connection.release();
    }
  }

  async function saveDetail({
    item,
    cachedAt,
    expiresAt,
  }) {
    const summary = createPlaceSummary(item);
    await database.query(
      `INSERT INTO places_cache (
         content_id, content_type_id, title, l_dong_regn_cd,
         l_dong_signgu_cd, cultures_json, summary_json, detail_json,
         source_updated_at, summary_cached_at, summary_expires_at,
         detail_cached_at, detail_expires_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         detail_json = VALUES(detail_json),
         detail_cached_at = VALUES(detail_cached_at),
         detail_expires_at = VALUES(detail_expires_at)`,
      [
        summary.contentId,
        summary.contentTypeId,
        summary.title,
        summary.lDongRegnCd,
        summary.lDongSignguCd,
        JSON.stringify(summary.cultures),
        JSON.stringify(summary),
        JSON.stringify(item),
        summary.sourceUpdatedAt,
        cachedAt,
        expiresAt,
        cachedAt,
        expiresAt,
      ],
    );
  }

  return Object.freeze({
    findPlace,
    findQuery,
    saveDetail,
    saveQuery,
  });
}

let defaultRepository;

function getDefaultRepository() {
  if (!defaultRepository) {
    defaultRepository = createPlaceCacheRepository();
  }
  return defaultRepository;
}

module.exports = {
  createPlaceCacheRepository,
  findPlace: contentId => getDefaultRepository().findPlace(contentId),
  findQuery: cacheKey => getDefaultRepository().findQuery(cacheKey),
  saveDetail: input => getDefaultRepository().saveDetail(input),
  saveQuery: input => getDefaultRepository().saveQuery(input),
};
