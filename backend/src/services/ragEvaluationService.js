'use strict';

const DEFAULT_SWEEP_THRESHOLDS = Object.freeze([0, 0.2, 0.3, 0.35, 0.4, 0.5]);

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

function validateDataset(dataset) {
  if (!dataset || typeof dataset !== 'object' || Array.isArray(dataset) ||
      typeof dataset.version !== 'string' || typeof dataset.owner !== 'string' ||
      !Array.isArray(dataset.cases) || dataset.cases.length < 30) {
    throw new TypeError('RAG 평가 세트에는 version, owner와 최소 30개 case가 필요합니다.');
  }
  const ids = new Set();
  for (const item of dataset.cases) {
    if (!item || typeof item.id !== 'string' || !item.id || ids.has(item.id) ||
        typeof item.query !== 'string' || !item.query.trim()) {
      throw new TypeError('RAG 평가 case의 id와 query가 올바르지 않습니다.');
    }
    ids.add(item.id);
    const expected = item.expected || {};
    const hasExpected = Array.isArray(expected.titles) && expected.titles.length > 0;
    if (!hasExpected && expected.empty !== true) {
      throw new TypeError('각 RAG 평가 case에는 기대 title 또는 empty=true가 필요합니다.');
    }
  }
  return dataset;
}

function matchesExpected(document, expected) {
  const contentId = String(document?.metadata?.contentId || '');
  if (Array.isArray(expected.contentIds) && expected.contentIds.map(String).includes(contentId)) {
    return true;
  }
  const title = normalizeTitle(document?.metadata?.place_name);
  return Array.isArray(expected.titles) && expected.titles
    .some(expectedTitle => normalizeTitle(expectedTitle) === title);
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

function metricSummary(caseResults, mode, thresholds) {
  const relevance = caseResults.filter(item => !item.expectedEmpty && !item.errorCode);
  const empty = caseResults.filter(item => item.expectedEmpty && !item.errorCode);
  const successful = caseResults.filter(item => !item.errorCode);
  const liveDocuments = successful.flatMap(item => item.documents);
  const trusted = liveDocuments.filter(document => document.metadata?.trustedSource === true);
  const latency = successful
    .map(item => Number(item.latencyMs))
    .filter(Number.isFinite);
  const inputTokens = successful.reduce((sum, item) => sum + Number(item.inputTokens || 0), 0);

  return {
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
    strictFilterRate: ratio(
      successful.filter(item => item.strictFiltersMatched).length,
      successful.length,
    ),
    thresholdSweep: thresholds.map(threshold => {
      const swept = relevance.map(item => {
        const documents = item.documents.filter(document => document.score >= threshold);
        const rank = documents.findIndex(document => matchesExpected(document, item.expected));
        return { hit: rank >= 0, reciprocalRank: rank >= 0 ? 1 / (rank + 1) : 0 };
      });
      return {
        hitRateAtK: ratio(swept.filter(item => item.hit).length, swept.length),
        mrrAtK: ratio(swept.reduce((sum, item) => sum + item.reciprocalRank, 0), swept.length),
        threshold,
      };
    }),
    trustedSourceRate: mode === 'live' ? ratio(trusted.length, liveDocuments.length) : null,
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
  ];
  if (mode === 'live') checks.push(['trustedSourceRate', required.trustedSourceRate]);
  return checks.every(([name, minimum]) =>
    minimum === undefined || (metrics[name] !== null && metrics[name] >= minimum),
  );
}

async function runRagEvaluation(options) {
  const dataset = validateDataset(options.dataset);
  if (typeof options.search !== 'function') {
    throw new TypeError('RAG 평가에는 search 함수가 필요합니다.');
  }
  const mode = options.mode === 'live' ? 'live' : 'mock';
  const limit = options.limit === null || options.limit === undefined
    ? dataset.cases.length
    : Math.min(dataset.cases.length, options.limit);
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new TypeError('RAG 평가 limit은 양의 정수여야 합니다.');
  }
  const selected = dataset.cases.slice(0, limit);
  const caseResults = [];
  for (const item of selected) {
    try {
      const result = await options.search(item.query, {
        ...(item.filters || {}),
        minResults: 1,
        topK: dataset.topK,
      });
      const expectedFilters = item.expectedFilters || item.filters || {};
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
      const rank = documents.findIndex(document => matchesExpected(document, item.expected));
      caseResults.push({
        documents,
        errorCode: null,
        expected: item.expected,
        expectedEmpty: item.expected.empty === true,
        hit: rank >= 0,
        id: item.id,
        inputTokens: Number(result.diagnostics?.usage?.inputTokens || 0),
        latencyMs: Number(result.diagnostics?.latencyMs?.total || 0),
        reciprocalRank: rank >= 0 ? 1 / (rank + 1) : 0,
        routingMatched: routeMatchesFilters(result.routeInfo, expectedFilters),
        strictFiltersMatched: documents.every(document =>
          documentMatchesFilters(document, expectedFilters)),
        warnings: result.diagnostics?.warnings || [],
      });
    } catch (error) {
      caseResults.push({
        documents: [],
        errorCode: typeof error?.code === 'string' ? error.code : 'RAG_EVALUATION_CASE_FAILED',
        expected: item.expected,
        expectedEmpty: item.expected.empty === true,
        hit: false,
        id: item.id,
        inputTokens: 0,
        latencyMs: 0,
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
  return {
    complete,
    dataset: { owner: dataset.owner, totalCases: dataset.cases.length, version: dataset.version },
    metrics,
    mode,
    passed,
    results: caseResults.map(item => ({
      errorCode: item.errorCode,
      hit: item.hit,
      id: item.id,
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
  DEFAULT_SWEEP_THRESHOLDS,
  normalizeTitle,
  runRagEvaluation,
  validateDataset,
};
