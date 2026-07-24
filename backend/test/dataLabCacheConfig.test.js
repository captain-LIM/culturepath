'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  DEFAULTS,
  getDataLabCacheConfig,
} = require('../src/config/dataLabCache');

test('uses deterministic low-call DataLab cache defaults', () => {
  const config = getDataLabCacheConfig({});

  assert.equal(config.enabled, true);
  assert.equal(config.referenceYmd, '20210513');
  assert.equal(config.compareDays, 7);
  assert.equal(config.ttlMs, DEFAULTS.ttlSeconds * 1000);
  assert.equal(
    config.staleMaxAgeMs,
    DEFAULTS.staleMaxAgeSeconds * 1000,
  );
});

test('parses explicit DataLab cache and reference-date settings', () => {
  const config = getDataLabCacheConfig({
    DATALAB_CACHE_ENABLED: 'false',
    DATALAB_REFERENCE_YMD: '20240229',
    DATALAB_COMPARE_DAYS: '14',
    DATALAB_CACHE_TTL_SECONDS: '60',
    DATALAB_CACHE_STALE_MAX_AGE_SECONDS: '120',
    DATALAB_CACHE_DB_FAILURE_COOLDOWN_SECONDS: '10',
  });

  assert.deepEqual(config, {
    enabled: false,
    referenceYmd: '20240229',
    compareDays: 14,
    ttlMs: 60_000,
    staleMaxAgeMs: 120_000,
    dbFailureCooldownMs: 10_000,
  });
});

test('rejects invalid DataLab dates, booleans, durations, and stale windows', () => {
  for (const env of [
    { DATALAB_REFERENCE_YMD: '20230229' },
    { DATALAB_CACHE_ENABLED: 'sometimes' },
    { DATALAB_COMPARE_DAYS: '0' },
    { DATALAB_CACHE_TTL_SECONDS: '-1' },
    {
      DATALAB_CACHE_TTL_SECONDS: '120',
      DATALAB_CACHE_STALE_MAX_AGE_SECONDS: '120',
    },
  ]) {
    assert.throws(() => getDataLabCacheConfig(env));
  }
});
