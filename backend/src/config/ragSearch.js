'use strict';

const DEFAULTS = Object.freeze({
  maxTopK: 10,
  minResults: 3,
  scoreThreshold: null,
  topK: 8,
});

function boundedInteger(value, name, fallback, maximum) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new TypeError(`${name}는 1 이상 ${maximum} 이하의 정수여야 합니다.`);
  }
  return parsed;
}

function optionalScore(value, name = 'QDRANT_SCORE_THRESHOLD') {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new TypeError(`${name}는 비어 있거나 0 이상 1 이하의 숫자여야 합니다.`);
  }
  return parsed;
}

function getRagSearchConfig(env = process.env, overrides = {}) {
  const topK = boundedInteger(
    overrides.topK ?? env.RAG_TOP_K,
    'RAG_TOP_K',
    DEFAULTS.topK,
    DEFAULTS.maxTopK,
  );
  const minResults = boundedInteger(
    overrides.minResults ?? env.RAG_MIN_RESULTS,
    'RAG_MIN_RESULTS',
    Math.min(DEFAULTS.minResults, topK),
    topK,
  );
  const scoreThreshold = optionalScore(
    Object.prototype.hasOwnProperty.call(overrides, 'scoreThreshold')
      ? overrides.scoreThreshold
      : env.QDRANT_SCORE_THRESHOLD,
  );

  return Object.freeze({
    maxTopK: DEFAULTS.maxTopK,
    minResults,
    scoreThreshold,
    topK,
  });
}

module.exports = { DEFAULTS, getRagSearchConfig, optionalScore };
