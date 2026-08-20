'use strict';

const pool = require('../config/db');
const { createPlaceSummary } = require('../models/placeSummary');

// 국문 외 언어별 상세 캐시. 컬럼명은 `detail_json_${lang}` 형태로 통일한다.
const TRANSLATION_LANGS = Object.freeze(['en', 'ja']);

const PLACE_COLUMNS = `
  content_id,
  summary_json,
  detail_json,
  ${TRANSLATION_LANGS.map(lang => `detail_json_${lang}`).join(',\n  ')},
  summary_cached_at,
  summary_expires_at,
  detail_cached_at,
  detail_expires_at,
  ${TRANSLATION_LANGS.map(lang => `detail_cached_at_${lang}, detail_expires_at_${lang}`).join(',\n  ')}
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

  const translations = {};
  for (const lang of TRANSLATION_LANGS) {
    const cachedAtRaw = row[`detail_cached_at_${lang}`];
    translations[lang] = {
      detail: parseJson(row[`detail_json_${lang}`], `detail_json_${lang}`),
      cachedAt: cachedAtRaw == null ? null : toTimestamp(cachedAtRaw),
      expiresAt:
        row[`detail_expires_at_${lang}`] == null
          ? null
          : toTimestamp(row[`detail_expires_at_${lang}`]),
    };
  }

  return {
    contentId: String(row.content_id),
    summary: parseJson(row.summary_json, 'summary_json'),
    detail: parseJson(row.detail_json, 'detail_json'),
    summaryCachedAt: toTimestamp(row.summary_cached_at),
    summaryExpiresAt: toTimestamp(row.summary_expires_at),
    detailCachedAt:
      row.detail_cached_at == null ? null : toTimestamp(row.detail_cached_at),
    detailExpiresAt:
      row.detail_expires_at == null ? null : toTimestamp(row.detail_expires_at),
    translations,
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

  async function listPlacesPage({ afterContentId = null, limit = 200 } = {}) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) {
      throw new TypeError('장소 페이지 limit은 1 이상 1000 이하의 정수여야 합니다.');
    }
    const hasCursor = afterContentId !== null && afterContentId !== undefined &&
      String(afterContentId) !== '';
    const [rows] = await database.query(
      `SELECT ${PLACE_COLUMNS}
         FROM places_cache
        ${hasCursor ? 'WHERE content_id > ?' : ''}
        ORDER BY content_id ASC
        LIMIT ?`,
      hasCursor ? [String(afterContentId), limit] : [limit],
    );
    const items = rows.map(mapPlaceRow);
    return {
      items,
      nextCursor: rows.length === limit
        ? String(rows[rows.length - 1].content_id)
        : null,
    };
  }

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

  async function findExistingPlaces(contentIds) {
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
    return rows.map(mapPlaceRow);
  }

  async function findPlaces(contentIds) {
    const existing = await findExistingPlaces(contentIds);
    const placesById = new Map(existing.map(place => [place.contentId, place]));

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

  async function saveDetailTranslation({
    contentId,
    lang,
    item,
    cachedAt,
    expiresAt,
  }) {
    if (!TRANSLATION_LANGS.includes(lang)) {
      throw new TypeError(`지원하지 않는 번역 언어입니다: ${lang}`);
    }
    // item이 null이면 "조회해봤지만 번역이 없다"는 확인 결과를 캐시한다.
    // 이렇게 해야 하루 1000건 트래픽 제한을 매 요청마다 소모하지 않는다.
    await database.query(
      `UPDATE places_cache
          SET detail_json_${lang} = ?, detail_cached_at_${lang} = ?, detail_expires_at_${lang} = ?
        WHERE content_id = ?`,
      [item ? JSON.stringify(item) : null, cachedAt, expiresAt, contentId],
    );
  }

  return Object.freeze({
    findPlace,
    findExistingPlaces,
    findPlaces,
    findQuery,
    listPlacesPage,
    saveDetail,
    saveDetailTranslation,
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
  findExistingPlaces: contentIds => getDefaultRepository().findExistingPlaces(contentIds),
  findPlaces: contentIds => getDefaultRepository().findPlaces(contentIds),
  findQuery: cacheKey => getDefaultRepository().findQuery(cacheKey),
  listPlacesPage: options => getDefaultRepository().listPlacesPage(options),
  saveDetail: input => getDefaultRepository().saveDetail(input),
  saveDetailTranslation: input => getDefaultRepository().saveDetailTranslation(input),
  saveQuery: input => getDefaultRepository().saveQuery(input),
};
