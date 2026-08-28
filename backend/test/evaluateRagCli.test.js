'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  DATASET_PATH,
  evaluationExitCode,
  LIVE_DATASET_PATH,
  loadDataset,
  MOCK_DATASET_PATH,
  parseArgs,
  safeFailure,
  usage,
  validateLiveConfiguration,
} = require('../scripts/evaluateRag');

test('loads the versioned evaluation set and parses explicit live options', () => {
  const mockDataset = loadDataset();
  const liveDataset = loadDataset('live');
  assert.equal(mockDataset.owner, '황찬우');
  assert.ok(mockDataset.cases.length >= 30);
  assert.equal(liveDataset.mode, 'live');
  assert.equal(liveDataset.cases.length, 15);
  assert.equal(DATASET_PATH, MOCK_DATASET_PATH);
  assert.notEqual(MOCK_DATASET_PATH, LIVE_DATASET_PATH);
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
  }, true));
});

test('allows an authenticated or local Qdrant deployment in live mode', () => {
  const required = {
    DB_HOST: 'configured',
    DB_USER: 'configured',
    DB_NAME: 'configured',
    OPENROUTER_API_KEY: 'configured',
    QDRANT_URL: 'http://127.0.0.1:6333',
  };
  assert.doesNotThrow(() => validateLiveConfiguration(required, true));
  assert.doesNotThrow(() => validateLiveConfiguration({
    ...required,
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
