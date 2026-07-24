'use strict';

const { isValidYmd } = require('../utils/dateYmd');

const DEFAULTS = Object.freeze({
  compareDays: 7,
  dbFailureCooldownSeconds: 30,
  enabled: true,
  referenceYmd: '20210513',
  staleMaxAgeSeconds: 30 * 24 * 60 * 60,
  ttlSeconds: 7 * 24 * 60 * 60,
});

function parseBoolean(value, fallback) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return fallback;
  }
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }
  throw new TypeError('DATALAB_CACHE_ENABLED는 boolean 값이어야 합니다.');
}

function parsePositiveInteger(value, name, fallback) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new TypeError(`${name}는 양의 정수여야 합니다.`);
  }
  return parsed;
}

function getDataLabCacheConfig(env = process.env) {
  const referenceYmd =
    env.DATALAB_REFERENCE_YMD?.trim() || DEFAULTS.referenceYmd;
  if (!isValidYmd(referenceYmd)) {
    throw new TypeError('DATALAB_REFERENCE_YMD는 실제 존재하는 YYYYMMDD 날짜여야 합니다.');
  }
  const ttlSeconds = parsePositiveInteger(
    env.DATALAB_CACHE_TTL_SECONDS,
    'DATALAB_CACHE_TTL_SECONDS',
    DEFAULTS.ttlSeconds,
  );
  const staleMaxAgeSeconds = parsePositiveInteger(
    env.DATALAB_CACHE_STALE_MAX_AGE_SECONDS,
    'DATALAB_CACHE_STALE_MAX_AGE_SECONDS',
    DEFAULTS.staleMaxAgeSeconds,
  );
  if (staleMaxAgeSeconds <= ttlSeconds) {
    throw new TypeError(
      'DATALAB_CACHE_STALE_MAX_AGE_SECONDS는 DATALAB_CACHE_TTL_SECONDS보다 커야 합니다.',
    );
  }

  return Object.freeze({
    enabled: parseBoolean(
      env.DATALAB_CACHE_ENABLED,
      DEFAULTS.enabled,
    ),
    referenceYmd,
    compareDays: parsePositiveInteger(
      env.DATALAB_COMPARE_DAYS,
      'DATALAB_COMPARE_DAYS',
      DEFAULTS.compareDays,
    ),
    ttlMs: ttlSeconds * 1000,
    staleMaxAgeMs: staleMaxAgeSeconds * 1000,
    dbFailureCooldownMs:
      parsePositiveInteger(
        env.DATALAB_CACHE_DB_FAILURE_COOLDOWN_SECONDS,
        'DATALAB_CACHE_DB_FAILURE_COOLDOWN_SECONDS',
        DEFAULTS.dbFailureCooldownSeconds,
      ) * 1000,
  });
}

module.exports = { DEFAULTS, getDataLabCacheConfig };
