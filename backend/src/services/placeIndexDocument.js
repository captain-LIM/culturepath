'use strict';

const crypto = require('node:crypto');
const { REGION_DEFINITIONS } = require('../config/regionCatalog');

const DOCUMENT_VERSION = 'culturepath-place-v1';
const INDEX_NAMESPACE = 'culturepath-place';
const UUID_NAMESPACE = Buffer.from('24f72aee8c1d4c32b64ff362fd734e53', 'hex');

function normalizedText(value, maximum = 4000) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maximum);
}

function uniqueTextArray(values, maximum = 100) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values
    .map(value => normalizedText(value, maximum))
    .filter(Boolean))];
}

function createPointId(contentId) {
  const value = normalizedText(contentId, 100);
  if (!value) throw new TypeError('인덱싱할 장소에는 contentId가 필요합니다.');
  const bytes = crypto.createHash('sha1')
    .update(UUID_NAMESPACE)
    .update(value, 'utf8')
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}

function resolveCatalogRegion(lDongRegnCd, lDongSignguCd) {
  const regionCode = normalizedText(lDongRegnCd, 2);
  const signguCode = normalizedText(lDongSignguCd, 3);
  if (!regionCode) return null;
  const combined = `${regionCode}${signguCode}`;
  const matches = Object.values(REGION_DEFINITIONS).filter(definition =>
    definition.visitorCodeGroups.some(group => group.some(code =>
      code.length === 2 ? code === regionCode : code === combined,
    )),
  );
  return matches.length === 1 ? matches[0] : null;
}

function compactPayload(payload) {
  return Object.fromEntries(Object.entries(payload).filter(([, value]) =>
    value !== null && value !== undefined && value !== '',
  ));
}

function buildPlaceIndexDocument(cachedPlace) {
  const summary = cachedPlace?.summary;
  const detail = cachedPlace?.detail || {};
  const contentId = normalizedText(cachedPlace?.contentId || summary?.contentId, 100);
  const title = normalizedText(summary?.title || detail?.title, 255);
  if (!contentId || !title) {
    throw new TypeError('인덱싱할 장소에는 contentId와 title이 필요합니다.');
  }

  const cultures = uniqueTextArray(summary?.cultures, 100);
  const lDongRegnCd = normalizedText(summary?.lDongRegnCd, 2);
  const lDongSignguCd = normalizedText(summary?.lDongSignguCd, 3);
  const catalogRegion = resolveCatalogRegion(lDongRegnCd, lDongSignguCd);
  const regionName = normalizedText(catalogRegion?.name || detail?.regionName, 100);
  const areaCode = normalizedText(catalogRegion?.areaCode, 100);
  const address = normalizedText(summary?.address || detail?.address, 500);
  const overview = normalizedText(detail?.overview, 2500);
  const openTime = normalizedText(detail?.openTime, 500);
  const restDate = normalizedText(detail?.restDate, 500);
  const tel = normalizedText(summary?.tel || detail?.tel, 100);
  const contentTypeId = normalizedText(summary?.contentTypeId, 20);
  const sourceUpdatedAt = normalizedText(summary?.sourceUpdatedAt, 50);

  const sections = [
    ['장소명', title],
    ['문화', cultures.join(', ')],
    ['지역', regionName],
    ['주소', address],
    ['소개', overview],
    ['운영시간', openTime],
    ['휴무일', restDate],
  ];
  const content = sections
    .filter(([, value]) => value)
    .map(([label, value]) => `${label}: ${value}`)
    .join('\n');

  const canonical = {
    areaCode,
    content,
    contentId,
    contentTypeId,
    cultures,
    documentVersion: DOCUMENT_VERSION,
    lDongRegnCd,
    lDongSignguCd,
    regionName,
    sourceUpdatedAt,
    tel,
  };
  const documentHash = crypto.createHash('sha256')
    .update(JSON.stringify(canonical), 'utf8')
    .digest('hex');

  return Object.freeze({
    content,
    documentHash,
    payload: Object.freeze(compactPayload({
      address,
      areaCode,
      category: cultures[0] || '기타',
      content,
      contentId,
      contentTypeId,
      cultures,
      documentHash,
      documentVersion: DOCUMENT_VERSION,
      indexNamespace: INDEX_NAMESPACE,
      lDongRegnCd,
      lDongSignguCd,
      openTime,
      regionName,
      restDate,
      source: 'TOUR_API',
      sourceUpdatedAt,
      tel,
      title,
    })),
    pointId: createPointId(contentId),
  });
}

module.exports = {
  DOCUMENT_VERSION,
  INDEX_NAMESPACE,
  buildPlaceIndexDocument,
  createPointId,
  resolveCatalogRegion,
};
