'use strict';

const DEFAULT_SWEEP_THRESHOLDS = Object.freeze([0, 0.2, 0.3, 0.35, 0.4, 0.5]);
const DATASET_MODES = Object.freeze({ MOCK: 'mock', LIVE: 'live' });
const LIVE_EXPECTED_OUTCOMES = Object.freeze(['relevant', 'empty', 'coverage_gap']);
const LIVE_COVERAGE_GAP_REASONS = Object.freeze([
  'UNCLASSIFIED_CULTURE',
  'MISSING_TRANSLATION',
  'SOURCE_DATA_INCOMPLETE',
]);
const LIVE_EVIDENCE_VERIFICATIONS = Object.freeze([
  'repository_snapshot_pending_mysql_audit',
  'mysql_verified',
]);
const LIVE_QUALITY_GATE_STATUSES = Object.freeze(['baseline', 'approved']);
const MINIMUM_CASES = Object.freeze({ mock: 30, live: 15 });
const RATIO_THRESHOLD_NAMES = Object.freeze(new Set([
  'classificationCoverageRate',
  'emptyCaseRate',
  'hitRateAtK',
  'mrrAtK',
  'routingAccuracy',
  'scorableCaseRate',
  'strictFilterRate',
  'trustedSourceRate',
]));
const LIVE_BASELINE_THRESHOLDS = Object.freeze({
  routingAccuracy: 1,
  strictFilterRate: 1,
  trustedSourceRate: 1,
});

function ratio(numerator, denominator) {
  return denominator ? numerator / denominator : null;
}

function percentile(values, percentage) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((percentage / 100) * sorted.length) - 1),
  );
  return sorted[index];
}

function normalizeTitle(value) {
  return String(value || '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^0-9a-z가-힣]+/g, '')
    .trim();
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isNonEmptyStringArray(value) {
  return Array.isArray(value) && value.length > 0 && value.every(isNonEmptyString);
}

function isNumericContentIdArray(value) {
  return isNonEmptyStringArray(value) && value.every(item => /^\d+$/.test(item));
}

function validateTitlesByLocale(titlesByLocale) {
  if (titlesByLocale === undefined) return;
  if (!titlesByLocale || typeof titlesByLocale !== 'object' || Array.isArray(titlesByLocale) ||
      !Object.keys(titlesByLocale).length ||
      !Object.values(titlesByLocale).every(isNonEmptyStringArray)) {
    throw new TypeError('live RAG 기대 titlesByLocale은 언어별 비어 있지 않은 title 배열이어야 합니다.');
  }
}

function validateTitlesByContentId(expected) {
  if (!Array.isArray(expected.contentIds) || expected.contentIds.length < 2) return;
  const mapping = expected.titlesByContentId;
  const expectedIds = [...new Set(expected.contentIds.map(String))].sort();
  const mappedIds = mapping && typeof mapping === 'object' && !Array.isArray(mapping)
    ? Object.keys(mapping).sort()
    : [];
  if (mappedIds.length !== expectedIds.length ||
      !mappedIds.every((contentId, index) => contentId === expectedIds[index])) {
    throw new TypeError('여러 contentId를 가진 live case에는 ID별 titlesByContentId가 필요합니다.');
  }
  for (const titlesByLocale of Object.values(mapping)) {
    validateTitlesByLocale(titlesByLocale);
  }
}

function validateLiveEvidence(evidence) {
  const validDate = isNonEmptyString(evidence?.observedAt) &&
    Number.isFinite(Date.parse(evidence.observedAt));
  if (!isNonEmptyString(evidence?.source) ||
      !LIVE_EVIDENCE_VERIFICATIONS.includes(evidence?.verification) ||
      !validDate) {
    throw new TypeError('live RAG case에는 source, verification, observedAt 평가 근거가 필요합니다.');
  }
}

function validateThresholds(thresholds) {
  if (!thresholds || typeof thresholds !== 'object' || Array.isArray(thresholds)) {
    throw new TypeError('RAG 평가 thresholds는 비율 기준 객체여야 합니다.');
  }
  for (const [name, value] of Object.entries(thresholds)) {
    if (!RATIO_THRESHOLD_NAMES.has(name) || !Number.isFinite(value) || value < 0 || value > 1) {
      throw new TypeError(`RAG 평가 threshold ${name}은 0 이상 1 이하의 유한한 숫자여야 합니다.`);
    }
  }
}

function validateMockCase(item) {
  const expected = item.expected || {};
  const hasExpected = isNonEmptyStringArray(expected.titles);
  if (!hasExpected && expected.empty !== true) {
    throw new TypeError('각 Mock RAG 평가 case에는 기대 title 또는 empty=true가 필요합니다.');
  }
}

function validateLiveCase(item) {
  const expected = item.expected || {};
  if (!LIVE_EXPECTED_OUTCOMES.includes(expected.outcome)) {
    throw new TypeError('live RAG case의 expected.outcome이 올바르지 않습니다.');
  }
  validateTitlesByLocale(expected.titlesByLocale);
  validateTitlesByContentId(expected);
  validateLiveEvidence(item.evidence);

  if (expected.outcome === 'relevant' && !isNumericContentIdArray(expected.contentIds)) {
    throw new TypeError('live relevant case에는 숫자형 expected.contentIds가 필요합니다.');
  }
  if (expected.outcome === 'empty' && expected.contentIds !== undefined) {
    throw new TypeError('live empty case에는 expected.contentIds를 지정할 수 없습니다.');
  }
  if (expected.outcome === 'coverage_gap') {
    if (!isNumericContentIdArray(expected.contentIds) ||
        !LIVE_COVERAGE_GAP_REASONS.includes(expected.coverageGapReason)) {
      throw new TypeError('live coverage_gap case에는 contentIds와 올바른 coverageGapReason이 필요합니다.');
    }
    if (expected.coverageGapReason === 'MISSING_TRANSLATION' &&
        (!isNonEmptyString(expected.coverageGapLocale) ||
          !isNonEmptyStringArray(expected.titlesByLocale?.[expected.coverageGapLocale]))) {
      throw new TypeError('MISSING_TRANSLATION case에는 coverageGapLocale과 해당 locale title이 필요합니다.');
    }
  }
}

function validateDataset(dataset, requestedMode) {
  const declaredMode = dataset?.mode || DATASET_MODES.MOCK;
  const mode = requestedMode || declaredMode;
  const minimumCases = MINIMUM_CASES[mode];
  if (!minimumCases || (dataset?.mode && dataset.mode !== mode)) {
    throw new TypeError('RAG 평가 모드와 dataset.mode가 일치해야 합니다.');
  }
  if (!dataset || typeof dataset !== 'object' || Array.isArray(dataset) ||
      !isNonEmptyString(dataset.version) || !isNonEmptyString(dataset.owner) ||
      !Array.isArray(dataset.cases) || dataset.cases.length < minimumCases) {
    throw new TypeError(
      `${mode === DATASET_MODES.LIVE ? 'live' : 'Mock'} RAG 평가 세트에는 version, owner와 최소 ${minimumCases}개 case가 필요합니다.`,
    );
  }
  if (!Number.isSafeInteger(dataset.topK) || dataset.topK < 1 || dataset.topK > 10) {
    throw new TypeError('RAG 평가 세트의 topK는 1 이상 10 이하의 정수여야 합니다.');
  }
  validateThresholds(dataset.thresholds);
  if (mode === DATASET_MODES.LIVE) {
    const gateStatus = dataset.qualityGate?.status;
    if (!LIVE_QUALITY_GATE_STATUSES.includes(gateStatus)) {
      throw new TypeError('live RAG 평가 세트에는 baseline 또는 approved qualityGate가 필요합니다.');
    }
    if (gateStatus === 'approved' &&
        (dataset.thresholds?.hitRateAtK === undefined || dataset.thresholds?.mrrAtK === undefined)) {
      throw new TypeError('approved live qualityGate에는 Hit@K와 MRR 기준이 필요합니다.');
    }
    for (const [name, required] of Object.entries(LIVE_BASELINE_THRESHOLDS)) {
      if (dataset.thresholds[name] !== required) {
        throw new TypeError(`live RAG baseline threshold ${name}은 ${required}이어야 합니다.`);
      }
    }
  }

  const ids = new Set();
  for (const item of dataset.cases) {
    if (!item || !isNonEmptyString(item.id) || ids.has(item.id) ||
        !isNonEmptyString(item.query)) {
      throw new TypeError('RAG 평가 case의 id와 query가 올바르지 않습니다.');
    }
    ids.add(item.id);
    if (mode === DATASET_MODES.LIVE) validateLiveCase(item);
    else validateMockCase(item);
  }
  return dataset;
}

function expectedOutcome(item, mode) {
  if (mode === DATASET_MODES.LIVE) return item.expected.outcome;
  return item.expected.empty === true ? 'empty' : 'relevant';
}

function findExpectedMatch(documents, expected, mode) {
  if (mode === DATASET_MODES.LIVE) {
    const expectedIds = new Set((expected.contentIds || []).map(String));
    const index = documents.findIndex(document =>
      expectedIds.has(String(document?.metadata?.contentId || '')),
    );
    return { basis: index >= 0 ? 'contentId' : null, index };
  }

  const expectedTitles = (expected.titles || []).map(normalizeTitle);
  const index = documents.findIndex(document =>
    expectedTitles.includes(normalizeTitle(document?.metadata?.place_name)),
  );
  return { basis: index >= 0 ? 'title' : null, index };
}

function documentMatchesFilters(document, filters = {}) {
  const metadata = document?.metadata || {};
  if (filters.region && metadata.region !== filters.region) return false;
  if (filters.category) {
    const cultures = Array.isArray(metadata.cultures) && metadata.cultures.length
      ? metadata.cultures
      : [metadata.category].filter(Boolean);
    if (!cultures.includes(filters.category)) return false;
  }
  if (filters.contentTypeId && String(metadata.contentTypeId || '') !== String(filters.contentTypeId)) {
    return false;
  }
  return true;
}

function routeMatchesFilters(routeInfo, filters = {}) {
  return (!filters.region || routeInfo?.region === filters.region) &&
    (!filters.category || routeInfo?.category === filters.category) &&
    (!filters.contentTypeId || String(routeInfo?.contentTypeId || '') === String(filters.contentTypeId));
}

function countBy(items, keySelector) {
  return items.reduce((counts, item) => {
    const key = keySelector(item);
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function metricSummary(caseResults, mode, thresholds) {
  const relevance = caseResults.filter(item =>
    item.expectedOutcome === 'relevant' && !item.errorCode,
  );
  const empty = caseResults.filter(item =>
    item.expectedOutcome === 'empty' && !item.errorCode,
  );
  const coverageGaps = caseResults.filter(item => item.expectedOutcome === 'coverage_gap');
  const successful = caseResults.filter(item => !item.errorCode);
  const liveDocuments = successful.flatMap(item => item.documents);
  const trusted = liveDocuments.filter(document => document.metadata?.trustedSource === true);
  const latency = successful
    .map(item => Number(item.latencyMs))
    .filter(Number.isFinite);
  const inputTokens = successful.reduce((sum, item) => sum + Number(item.inputTokens || 0), 0);
  const cultureCases = caseResults.filter(item => item.expectedFilters?.category);
  const unclassifiedCultureCases = cultureCases.filter(item =>
    item.coverageGapReason === 'UNCLASSIFIED_CULTURE',
  );

  return {
    classificationCoverageRate: mode === DATASET_MODES.LIVE
      ? ratio(cultureCases.length - unclassifiedCultureCases.length, cultureCases.length)
      : null,
    coverageGapCount: mode === DATASET_MODES.LIVE ? coverageGaps.length : 0,
    coverageGapRate: mode === DATASET_MODES.LIVE
      ? ratio(coverageGaps.length, caseResults.length)
      : null,
    coverageGapReasons: mode === DATASET_MODES.LIVE
      ? countBy(coverageGaps, item => item.coverageGapReason)
      : {},
    emptyCaseRate: ratio(empty.filter(item => item.documents.length === 0).length, empty.length),
    errorCount: caseResults.filter(item => item.errorCode).length,
    executedCases: caseResults.length,
    hitRateAtK: ratio(relevance.filter(item => item.hit).length, relevance.length),
    inputTokens,
    latencyMs: {
      p50: percentile(latency, 50),
      p95: percentile(latency, 95),
    },
    mrrAtK: ratio(
      relevance.reduce((sum, item) => sum + item.reciprocalRank, 0),
      relevance.length,
    ),
    routingAccuracy: ratio(
      successful.filter(item => item.routingMatched).length,
      successful.length,
    ),
    scorableCaseRate: mode === DATASET_MODES.LIVE
      ? ratio(relevance.length + empty.length, successful.length)
      : 1,
    strictFilterRate: ratio(
      successful.filter(item => item.strictFiltersMatched).length,
      successful.length,
    ),
    thresholdSweep: thresholds.map(threshold => {
      const swept = relevance.map(item => {
        const documents = item.documents.filter(document => document.score >= threshold);
        const match = findExpectedMatch(documents, item.expected, mode);
        return {
          hit: match.index >= 0,
          reciprocalRank: match.index >= 0 ? 1 / (match.index + 1) : 0,
        };
      });
      return {
        hitRateAtK: ratio(swept.filter(item => item.hit).length, swept.length),
        mrrAtK: ratio(swept.reduce((sum, item) => sum + item.reciprocalRank, 0), swept.length),
        threshold,
      };
    }),
    trustedSourceRate: mode === DATASET_MODES.LIVE
      ? ratio(trusted.length, liveDocuments.length)
      : null,
  };
}

function passesThresholds(metrics, required, mode, complete) {
  if (!complete || metrics.errorCount > 0) return false;
  const checks = [
    ['hitRateAtK', required.hitRateAtK],
    ['mrrAtK', required.mrrAtK],
    ['routingAccuracy', required.routingAccuracy],
    ['strictFilterRate', required.strictFilterRate],
    ['emptyCaseRate', required.emptyCaseRate],
    ['classificationCoverageRate', required.classificationCoverageRate],
    ['scorableCaseRate', required.scorableCaseRate],
  ];
  if (mode === DATASET_MODES.LIVE) checks.push(['trustedSourceRate', required.trustedSourceRate]);
  return checks.every(([name, minimum]) =>
    minimum === undefined || (metrics[name] !== null && metrics[name] >= minimum),
  );
}

async function runRagEvaluation(options) {
  const mode = options.mode === DATASET_MODES.LIVE ? DATASET_MODES.LIVE : DATASET_MODES.MOCK;
  const dataset = validateDataset(options.dataset, mode);
  if (typeof options.search !== 'function') {
    throw new TypeError('RAG 평가에는 search 함수가 필요합니다.');
  }
  const limit = options.limit === null || options.limit === undefined
    ? dataset.cases.length
    : Math.min(dataset.cases.length, options.limit);
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new TypeError('RAG 평가 limit은 양의 정수여야 합니다.');
  }
  const selected = dataset.cases.slice(0, limit);
  const caseResults = [];
  for (const item of selected) {
    const outcome = expectedOutcome(item, mode);
    const expectedFilters = item.expectedFilters || item.filters || {};
    try {
      const result = await options.search(item.query, {
        ...(item.filters || {}),
        minResults: 1,
        topK: dataset.topK,
      });
      const documents = result.documents.map(document => ({
        metadata: {
          category: document.metadata?.category || '',
          contentId: document.metadata?.contentId || null,
          contentTypeId: document.metadata?.contentTypeId || null,
          cultures: document.metadata?.cultures || [],
          place_name: document.metadata?.place_name || '',
          region: document.metadata?.region || '',
          trustedSource: document.metadata?.trustedSource === true,
        },
        score: Number(document.score),
      }));
      const match = outcome === 'relevant'
        ? findExpectedMatch(documents, item.expected, mode)
        : { basis: null, index: -1 };
      caseResults.push({
        coverageGapReason: item.expected.coverageGapReason || null,
        documents,
        errorCode: null,
        expected: item.expected,
        expectedFilters,
        expectedOutcome: outcome,
        hit: match.index >= 0,
        id: item.id,
        inputTokens: Number(result.diagnostics?.usage?.inputTokens || 0),
        latencyMs: Number(result.diagnostics?.latencyMs?.total || 0),
        matchedBy: match.basis,
        reciprocalRank: match.index >= 0 ? 1 / (match.index + 1) : 0,
        routingMatched: routeMatchesFilters(result.routeInfo, expectedFilters),
        strictFiltersMatched: documents.every(document =>
          documentMatchesFilters(document, expectedFilters)),
        warnings: result.diagnostics?.warnings || [],
      });
    } catch (error) {
      caseResults.push({
        coverageGapReason: item.expected.coverageGapReason || null,
        documents: [],
        errorCode: typeof error?.code === 'string' ? error.code : 'RAG_EVALUATION_CASE_FAILED',
        expected: item.expected,
        expectedFilters,
        expectedOutcome: outcome,
        hit: false,
        id: item.id,
        inputTokens: 0,
        latencyMs: 0,
        matchedBy: null,
        reciprocalRank: 0,
        routingMatched: false,
        strictFiltersMatched: false,
        warnings: [],
      });
    }
  }

  const metrics = metricSummary(
    caseResults,
    mode,
    options.sweepThresholds || DEFAULT_SWEEP_THRESHOLDS,
  );
  const complete = selected.length === dataset.cases.length;
  const passed = passesThresholds(metrics, dataset.thresholds || {}, mode, complete);
  const qualityGate = dataset.qualityGate || { status: 'approved' };
  const evidenceVerified = mode !== DATASET_MODES.LIVE || dataset.cases.every(item =>
    item.evidence.verification === 'mysql_verified',
  );
  const contractReady = qualityGate.status === 'approved' && evidenceVerified;
  return {
    complete,
    dataset: {
      owner: dataset.owner,
      totalCases: dataset.cases.length,
      version: dataset.version,
    },
    metrics,
    mode,
    passed,
    qualityGate: {
      contractReady,
      evidenceVerified,
      ready: contractReady && complete && passed,
      relevanceThresholdsEnforced:
        dataset.thresholds?.hitRateAtK !== undefined && dataset.thresholds?.mrrAtK !== undefined,
      status: qualityGate.status,
    },
    results: caseResults.map(item => ({
      coverageGapReason: item.coverageGapReason,
      errorCode: item.errorCode,
      expectedContentIds: item.expected.contentIds || [],
      expectedOutcome: item.expectedOutcome,
      expectedTitlesByLocale: item.expected.titlesByLocale || {},
      expectedTitlesByContentId: item.expected.titlesByContentId || {},
      hit: item.hit,
      id: item.id,
      matchedBy: item.matchedBy,
      reciprocalRank: item.reciprocalRank,
      returned: item.documents.map(document => ({
        contentId: document.metadata.contentId,
        score: document.score,
        title: document.metadata.place_name,
      })),
      routingMatched: item.routingMatched,
      strictFiltersMatched: item.strictFiltersMatched,
      warnings: item.warnings,
    })),
    thresholds: dataset.thresholds || {},
  };
}

module.exports = {
  DATASET_MODES,
  DEFAULT_SWEEP_THRESHOLDS,
  LIVE_COVERAGE_GAP_REASONS,
  LIVE_EVIDENCE_VERIFICATIONS,
  LIVE_EXPECTED_OUTCOMES,
  LIVE_BASELINE_THRESHOLDS,
  LIVE_QUALITY_GATE_STATUSES,
  normalizeTitle,
  runRagEvaluation,
  validateDataset,
};
