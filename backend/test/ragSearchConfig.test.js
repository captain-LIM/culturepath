'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { DEFAULTS, getRagSearchConfig } = require('../src/config/ragSearch');

test('uses bounded calibration defaults without an arbitrary score threshold', () => {
  assert.deepEqual(getRagSearchConfig({}), {
    maxTopK: 10,
    minResults: 3,
    scoreThreshold: null,
    topK: 8,
  });
  assert.equal(DEFAULTS.topK, 8);
});

test('validates top-k, shortage, and optional score settings', () => {
  assert.deepEqual(getRagSearchConfig({
    RAG_TOP_K: '6',
    RAG_MIN_RESULTS: '2',
    QDRANT_SCORE_THRESHOLD: '0.42',
  }), {
    maxTopK: 10,
    minResults: 2,
    scoreThreshold: 0.42,
    topK: 6,
  });
  assert.throws(() => getRagSearchConfig({ RAG_TOP_K: '11' }), /10 이하/);
  assert.throws(() => getRagSearchConfig({ RAG_TOP_K: '2', RAG_MIN_RESULTS: '3' }), /2 이하/);
  assert.throws(() => getRagSearchConfig({ QDRANT_SCORE_THRESHOLD: '1.1' }), /1 이하/);
});
