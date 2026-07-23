'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  DEFAULTS,
  getPlaceCacheConfig,
} = require('../src/config/placeCache');

test('uses low-cost place-cache defaults', () => {
  const config = getPlaceCacheConfig({});

  assert.deepEqual(config, {
    enabled: true,
    ttlMs: DEFAULTS.ttlSeconds * 1000,
    staleMaxAgeMs: DEFAULTS.staleMaxAgeSeconds * 1000,
    dbFailureCooldownMs: DEFAULTS.dbFailureCooldownSeconds * 1000,
  });
  assert.ok(Object.isFrozen(config));
});

test('parses explicit place-cache environment values', () => {
  const config = getPlaceCacheConfig({
    PLACE_CACHE_ENABLED: 'off',
    PLACE_CACHE_TTL_SECONDS: '60',
    PLACE_CACHE_STALE_MAX_AGE_SECONDS: '600',
    PLACE_CACHE_DB_FAILURE_COOLDOWN_SECONDS: '5',
  });

  assert.deepEqual(config, {
    enabled: false,
    ttlMs: 60_000,
    staleMaxAgeMs: 600_000,
    dbFailureCooldownMs: 5_000,
  });
});

test('rejects invalid booleans, durations, and stale windows', () => {
  assert.throws(
    () => getPlaceCacheConfig({ PLACE_CACHE_ENABLED: 'maybe' }),
    /boolean/,
  );
  assert.throws(
    () => getPlaceCacheConfig({ PLACE_CACHE_TTL_SECONDS: '0' }),
    /양의 정수/,
  );
  assert.throws(
    () => getPlaceCacheConfig({
      PLACE_CACHE_TTL_SECONDS: '60',
      PLACE_CACHE_STALE_MAX_AGE_SECONDS: '60',
    }),
    /커야/,
  );
});
