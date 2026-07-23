'use strict';

const DEFAULTS = Object.freeze({
  dbFailureCooldownSeconds: 30,
  enabled: true,
  staleMaxAgeSeconds: 7 * 24 * 60 * 60,
  ttlSeconds: 24 * 60 * 60,
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
  throw new TypeError('PLACE_CACHE_ENABLED는 boolean 값이어야 합니다.');
}

function parsePositiveSeconds(value, name, fallback) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return fallback;
  }

  const seconds = Number(value);
  if (!Number.isInteger(seconds) || seconds <= 0) {
    throw new TypeError(`${name}는 양의 정수여야 합니다.`);
  }
  return seconds;
}

function getPlaceCacheConfig(env = process.env) {
  const ttlSeconds = parsePositiveSeconds(
    env.PLACE_CACHE_TTL_SECONDS,
    'PLACE_CACHE_TTL_SECONDS',
    DEFAULTS.ttlSeconds,
  );
  const staleMaxAgeSeconds = parsePositiveSeconds(
    env.PLACE_CACHE_STALE_MAX_AGE_SECONDS,
    'PLACE_CACHE_STALE_MAX_AGE_SECONDS',
    DEFAULTS.staleMaxAgeSeconds,
  );
  const dbFailureCooldownSeconds = parsePositiveSeconds(
    env.PLACE_CACHE_DB_FAILURE_COOLDOWN_SECONDS,
    'PLACE_CACHE_DB_FAILURE_COOLDOWN_SECONDS',
    DEFAULTS.dbFailureCooldownSeconds,
  );

  if (staleMaxAgeSeconds <= ttlSeconds) {
    throw new TypeError(
      'PLACE_CACHE_STALE_MAX_AGE_SECONDS는 PLACE_CACHE_TTL_SECONDS보다 커야 합니다.',
    );
  }

  return Object.freeze({
    enabled: parseBoolean(env.PLACE_CACHE_ENABLED, DEFAULTS.enabled),
    ttlMs: ttlSeconds * 1000,
    staleMaxAgeMs: staleMaxAgeSeconds * 1000,
    dbFailureCooldownMs: dbFailureCooldownSeconds * 1000,
  });
}

module.exports = { DEFAULTS, getPlaceCacheConfig };
