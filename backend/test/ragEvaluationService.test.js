'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { loadDataset } = require('../scripts/evaluateRag');
const { runRagEvaluation, validateDataset } = require('../src/services/ragEvaluationService');
const { routeQuery } = require('../src/services/ragQuery');
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

test('validates the separate live dataset contract and rejects title-only relevance labels', () => {
  const live = loadDataset('live');
  assert.equal(validateDataset(live, 'live'), live);
  assert.equal(live.cases.length, 15);

  const undersized = structuredClone(live);
  undersized.cases = undersized.cases.slice(0, 14);
  assert.throws(() => validateDataset(undersized, 'live'), /최소 15개/);

  const titleOnly = structuredClone(live);
  delete titleOnly.cases[0].expected.contentIds;
  assert.throws(() => validateDataset(titleOnly, 'live'), /expected\.contentIds/);

  const missingEvidence = structuredClone(live);
  delete missingEvidence.cases[0].evidence;
  assert.throws(() => validateDataset(missingEvidence, 'live'), /평가 근거/);

  const missingGate = structuredClone(live);
  delete missingGate.qualityGate;
  assert.throws(() => validateDataset(missingGate, 'live'), /qualityGate/);

  const prematureApproval = structuredClone(live);
  prematureApproval.qualityGate.status = 'approved';
  assert.throws(() => validateDataset(prematureApproval, 'live'), /Hit@K와 MRR/);

  const invalidThreshold = structuredClone(live);
  invalidThreshold.thresholds.hitRateAtK = null;
  assert.throws(() => validateDataset(invalidThreshold, 'live'), /유한한 숫자/);

  for (const name of ['routingAccuracy', 'strictFilterRate', 'trustedSourceRate']) {
    const missingBaseline = structuredClone(live);
    delete missingBaseline.thresholds[name];
    assert.throws(() => validateDataset(missingBaseline, 'live'), new RegExp(name));

    const relaxedBaseline = structuredClone(live);
    relaxedBaseline.thresholds[name] = 0.99;
    assert.throws(() => validateDataset(relaxedBaseline, 'live'), new RegExp(name));
  }

  const ambiguousTitles = structuredClone(live);
  delete ambiguousTitles.cases.find(item =>
    item.id === 'live-seoul-art-museums').expected.titlesByContentId;
  assert.throws(() => validateDataset(ambiguousTitles, 'live'), /titlesByContentId/);

  assert.throws(() => validateDataset(live, 'mock'), /dataset\.mode/);
});

test('keeps every live fixture expected filter aligned with the real query router', () => {
  const dataset = loadDataset('live');
  for (const item of dataset.cases) {
    const routed = routeQuery(item.query, item.filters || {});
    const expected = item.expectedFilters || item.filters || {};
    assert.equal(routed.region, expected.region || null, `${item.id} region`);
    assert.equal(routed.category, expected.category || null, `${item.id} category`);
    assert.equal(
      routed.contentTypeId,
      expected.contentTypeId || null,
      `${item.id} contentTypeId`,
    );
  }
});

test('matches live relevance by contentId and reports known coverage gaps separately', async () => {
  const dataset = loadDataset('live');
  const casesByQuery = new Map(dataset.cases.map(item => [item.query, item]));
  const search = async query => {
    const item = casesByQuery.get(query);
    const filters = item.expectedFilters || {};
    const isCoverageGap = item.expected.outcome === 'coverage_gap';
    return {
      documents: isCoverageGap ? [] : [{
        metadata: {
          category: filters.category || '',
          contentId: item.expected.contentIds[0],
          contentTypeId: filters.contentTypeId || null,
          cultures: filters.category ? [filters.category] : [],
          place_name: item.id === 'live-gangneung-ojukheon-region'
            ? '大きく変わった表示名'
            : item.expected.titlesByLocale.ko[0],
          region: filters.region || '',
          trustedSource: true,
        },
        score: 0.9,
      }],
      diagnostics: { latencyMs: { total: 2 }, usage: { inputTokens: 3 }, warnings: [] },
      routeInfo: { ...filters },
    };
  };
  const result = await runRagEvaluation({ dataset, mode: 'live', search });

  assert.equal(result.complete, true);
  assert.equal(result.passed, true);
  assert.deepEqual(result.qualityGate, {
    contractReady: false,
    evidenceVerified: false,
    ready: false,
    relevanceThresholdsEnforced: false,
    status: 'baseline',
  });
  assert.equal(result.metrics.hitRateAtK, 1);
  assert.equal(result.metrics.coverageGapCount, 5);
  assert.equal(result.metrics.coverageGapRate, 5 / 15);
  assert.equal(result.metrics.classificationCoverageRate, 9 / 14);
  assert.equal(result.metrics.scorableCaseRate, 10 / 15);
  assert.deepEqual(result.metrics.coverageGapReasons, { UNCLASSIFIED_CULTURE: 5 });
  assert.equal(result.results[0].matchedBy, 'contentId');
  assert.equal(result.results[0].hit, true);
  assert.deepEqual(result.results[0].expectedTitlesByLocale.ko, [
    '오죽헌',
    '강릉 오죽헌·시립박물관',
  ]);
  assert.deepEqual(
    result.results.find(item => item.id === 'live-seoul-art-museums')
      .expectedTitlesByContentId['130227'].ko,
    ['일민미술관'],
  );

  dataset.qualityGate.status = 'approved';
  dataset.thresholds.hitRateAtK = 0.8;
  dataset.thresholds.mrrAtK = 0.5;
  for (const item of dataset.cases) item.evidence.verification = 'mysql_verified';
  const approved = await runRagEvaluation({ dataset, mode: 'live', search });
  assert.equal(approved.qualityGate.contractReady, true);
  assert.equal(approved.qualityGate.ready, true);
});

test('does not accept a matching live title when contentId differs', async () => {
  const dataset = loadDataset('live');
  dataset.qualityGate.status = 'approved';
  dataset.thresholds.hitRateAtK = 0.8;
  dataset.thresholds.mrrAtK = 0.5;
  for (const item of dataset.cases) item.evidence.verification = 'mysql_verified';
  const first = dataset.cases[0];
  const result = await runRagEvaluation({
    dataset,
    limit: 1,
    mode: 'live',
    search: async () => ({
      documents: [{
        metadata: {
          contentId: '9999999',
          cultures: [],
          place_name: first.expected.titlesByLocale.ko[0],
          region: '강릉',
          trustedSource: true,
        },
        score: 0.9,
      }],
      diagnostics: { latencyMs: { total: 1 }, usage: { inputTokens: 1 }, warnings: [] },
      routeInfo: { region: '강릉' },
    }),
  });

  assert.equal(result.results[0].hit, false);
  assert.equal(result.results[0].matchedBy, null);
  assert.equal(result.qualityGate.contractReady, true);
  assert.equal(result.qualityGate.ready, false);
});
