'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { assertProdStage, assertUsage, SETTINGS } = require('../scripts/provisionNcpTourProd');

test('prod stage accepts only the approved immutable configuration', () => {
  const stage = { stageName: 'prod', endpointDomain: 'https://apis.data.go.kr',
    throttleRps: 5, isMaintenance: false, enabledContentEncoding: false };
  assertProdStage(stage);
  for (const patch of [{ stageName: 'test' }, { cacheTtlSec: 60 }, { throttleRps: 2 },
    { endpointDomain: 'https://example.com' }, { enabledContentEncoding: true }]) {
    assert.throws(() => assertProdStage({ ...stage, ...patch }), { code: 'STAGE_MISMATCH' });
  }
});

test('prod usage verification rejects plan or quota drift', () => {
  const usage = { total: 0, content: [], ...SETTINGS };
  assertUsage(usage);
  for (const patch of [{ dayQuotaRequest: 1000 }, { monthQuotaRequest: 25000 },
    { rateRps: 2 }, { quotaCondition: '4xx' }, { total: 1, content: [{}] }]) {
    assert.throws(() => assertUsage({ ...usage, ...patch }), { code: 'USAGE_PLAN_MISMATCH' });
  }
});
