'use strict';

const { classifyTourPlace } = require('../config/cultureCategoryMap');
const { createPlaceSummary } = require('../models/placeSummary');
const { ExternalApiError } = require('./externalApiError');

const HTML_ENTITIES = Object.freeze({
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"',
});

function decodeHtmlEntities(value) {
  let decoded = String(value);

  for (let pass = 0; pass < 3; pass += 1) {
    const previous = decoded;
    const next = decoded.replace(
      /&(#(?:x[0-9a-f]+|\d+)|amp|apos|gt|lt|nbsp|quot);/gi,
      (match, entity) => {
        const normalized = entity.toLowerCase();
        if (normalized[0] !== '#') {
          return HTML_ENTITIES[normalized] ?? match;
        }

        const hexadecimal = normalized[1] === 'x';
        const codePoint = Number.parseInt(
          normalized.slice(hexadecimal ? 2 : 1),
          hexadecimal ? 16 : 10,
        );
        if (
          !Number.isInteger(codePoint) ||
          codePoint < 0 ||
          codePoint > 0x10ffff ||
          (codePoint >= 0xd800 && codePoint <= 0xdfff)
        ) {
          return match;
        }
        return String.fromCodePoint(codePoint);
      },
    );
    decoded = next;
    if (next === previous) {
      break;
    }
  }

  return decoded;
}

function normalizeNullableString(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = decodeHtmlEntities(value)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized || null;
}

function normalizeCoordinate(value, min, max) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return null;
  }

  const coordinate = Number(value);
  return Number.isFinite(coordinate) && coordinate >= min && coordinate <= max
    ? coordinate
    : null;
}

function normalizeHttpUrl(value) {
  const normalized = normalizeNullableString(value);
  if (!normalized) {
    return null;
  }

  try {
    const url = new URL(normalized);
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function normalizeTourTimestamp(value) {
  const timestamp = String(value || '').trim();
  const match = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(timestamp);
  if (!match) {
    return null;
  }

  const [, year, month, day, hour, minute, second] = match;
  const date = new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
    ),
  );

  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() !== Number(month) - 1 ||
    date.getUTCDate() !== Number(day) ||
    date.getUTCHours() !== Number(hour) ||
    date.getUTCMinutes() !== Number(minute) ||
    date.getUTCSeconds() !== Number(second)
  ) {
    return null;
  }

  return `${year}-${month}-${day}T${hour}:${minute}:${second}+09:00`;
}

function normalizeTourPlace(item, options = {}) {
  const contentId = normalizeNullableString(item?.contentid ?? item?.contentId);
  const title = normalizeNullableString(item?.title);

  if (!contentId || !title) {
    throw new ExternalApiError('TourAPI 장소에 contentId 또는 title이 없습니다.', {
      code: 'INVALID_RESPONSE',
      service: 'tour',
      operation: options.operation || null,
    });
  }

  const addressParts = [item?.addr1, item?.addr2]
    .map(normalizeNullableString)
    .filter(Boolean);
  const cultures = (options.classify || classifyTourPlace)(item, options);
  const lclsSystmCodes = [
    item?.lclsSystm1 ?? item?.lcls_systm1,
    item?.lclsSystm2 ?? item?.lcls_systm2,
    item?.lclsSystm3 ?? item?.lcls_systm3,
  ]
    .map(normalizeNullableString)
    .filter((value, index, values) => value && values.indexOf(value) === index);

  return createPlaceSummary({
    contentId,
    contentTypeId: normalizeNullableString(
      item?.contenttypeid ?? item?.contentTypeId,
    ),
    title,
    areaCode: normalizeNullableString(item?.areacode ?? item?.areaCode),
    sigunguCode: normalizeNullableString(
      item?.sigungucode ?? item?.sigunguCode,
    ),
    lDongRegnCd: normalizeNullableString(
      item?.lDongRegnCd ?? item?.ldongregncd,
    ),
    lDongSignguCd: normalizeNullableString(
      item?.lDongSignguCd ?? item?.ldongsigngucd,
    ),
    address: addressParts.join(' ') || null,
    latitude: normalizeCoordinate(item?.mapy, -90, 90),
    longitude: normalizeCoordinate(item?.mapx, -180, 180),
    tel: normalizeNullableString(item?.tel),
    imageUrl: normalizeHttpUrl(item?.firstimage),
    thumbnailUrl: normalizeHttpUrl(item?.firstimage2),
    lclsSystmCodes,
    cultures,
    sourceUpdatedAt: normalizeTourTimestamp(
      item?.modifiedtime ?? item?.modifiedTime,
    ),
  });
}

module.exports = {
  decodeHtmlEntities,
  normalizeCoordinate,
  normalizeHttpUrl,
  normalizeNullableString,
  normalizeTourPlace,
  normalizeTourTimestamp,
};
