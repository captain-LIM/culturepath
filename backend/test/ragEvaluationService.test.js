'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { loadDataset } = require('../scripts/evaluateRag');
const { runRagEvaluation, validateDataset } = require('../src/services/ragEvaluationService');
const { createRagSearchService } = require('../src/services/ragSearchService');

test('runs the complete fixed mock evaluation without external services', async () => {
  const service = createRagSearchService();
  const result = await runRagEvaluation({
    dataset: loadDataset(),
    mode: 'mock',
    search: (query, input) => service.search(query, input, {
      env: { USE_MOCK_RAG: 'true' },
    }),
  });

  assert.equal(result.complete, true);
  assert.equal(result.passed, true);
  assert.equal(result.metrics.errorCount, 0);
  assert.equal(result.metrics.hitRateAtK, 1);
  assert.equal(result.metrics.routingAccuracy, 1);
  assert.equal(result.metrics.strictFilterRate, 1);
  assert.equal(result.metrics.trustedSourceRate, null);
  assert.ok(result.metrics.thresholdSweep.some(item => item.threshold === 0.35));
  assert.equal(JSON.stringify(result).includes('embedding'), false);
});

test('marks a limited run incomplete instead of claiming evaluation success', async () => {
  const dataset = loadDataset();
  const result = await runRagEvaluation({
    dataset,
    limit: 1,
    mode: 'mock',
    search: async (_query, input) => ({
      documents: [{
        metadata: {
          category: input.category || '커피·카페',
          cultures: [input.category || '커피·카페'],
          place_name: '안목해변 커피거리',
          region: input.region || '강릉',
        },
        score: 0.9,
      }],
      diagnostics: { latencyMs: { total: 1 }, usage: { inputTokens: 1 }, warnings: [] },
      routeInfo: { category: '커피·카페', region: '강릉' },
    }),
  });
  assert.equal(result.complete, false);
  assert.equal(result.passed, false);
  assert.equal(result.metrics.executedCases, 1);
});

test('rejects undersized, duplicate, and unscorable datasets', () => {
  assert.throws(() => validateDataset({ version: 'v', owner: '황찬우', cases: [] }), /최소 30개/);
  const valid = loadDataset();
  const duplicate = structuredClone(valid);
  duplicate.cases[1].id = duplicate.cases[0].id;
  assert.throws(() => validateDataset(duplicate), /id와 query/);
  const unscorable = structuredClone(valid);
  unscorable.cases[0].expected = {};
  assert.throws(() => validateDataset(unscorable), /기대 title/);
});
