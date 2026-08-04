'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  evaluationExitCode,
  loadDataset,
  parseArgs,
  safeFailure,
  usage,
  validateLiveConfiguration,
} = require('../scripts/evaluateRag');

test('loads the versioned evaluation set and parses explicit live options', () => {
  const dataset = loadDataset();
  assert.equal(dataset.owner, '황찬우');
  assert.ok(dataset.cases.length >= 30);
  assert.deepEqual(parseArgs(['--live', '--limit=3']), {
    help: false,
    limit: 3,
    live: true,
  });
  assert.throws(() => parseArgs(['--limit=0']), /1 이상/);
  assert.throws(() => parseArgs(['--dataset=secret']), /지원하지 않는/);
  assert.match(usage(), /--live/);
});

test('requires provider, vector store, and source DB settings only in live mode', () => {
  assert.doesNotThrow(() => validateLiveConfiguration({}, false));
  assert.throws(() => validateLiveConfiguration({}, true), /DB_HOST.*OPENROUTER_API_KEY.*QDRANT_URL/);
  assert.doesNotThrow(() => validateLiveConfiguration({
    DB_HOST: 'configured',
    DB_USER: 'configured',
    DB_NAME: 'configured',
    OPENROUTER_API_KEY: 'configured',
    QDRANT_URL: 'configured',
    QDRANT_API_KEY: 'configured',
  }, true));
});

test('sanitizes operational errors without exposing provider details', () => {
  const error = new Error('https://private.example?api-key=secret');
  error.code = 'QDRANT_REQUEST_FAILED';
  assert.equal(safeFailure(error), 'RAG 검색 평가 실패 (QDRANT_REQUEST_FAILED)');
  assert.doesNotMatch(safeFailure(error), /private|secret|https/);
});

test('fails a limited smoke only when cases contain operational errors', () => {
  assert.equal(evaluationExitCode({
    complete: false,
    passed: false,
    metrics: { errorCount: 0 },
  }), 0);
  assert.equal(evaluationExitCode({
    complete: false,
    passed: false,
    metrics: { errorCount: 3 },
  }), 1);
  assert.equal(evaluationExitCode({
    complete: true,
    passed: false,
    metrics: { errorCount: 0 },
  }), 1);
});
