'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  parseArgs,
  safeFailure,
  usage,
  validateRuntimeConfiguration,
} = require('../scripts/indexPlaces');

test('parses bounded, explicit indexing options', () => {
  assert.deepEqual(parseArgs(['--dry-run', '--limit=3', '--batch-size=2']), {
    batchSize: 2,
    dryRun: true,
    help: false,
    limit: 3,
    prune: false,
  });
  assert.equal(parseArgs(['--prune']).prune, true);
  assert.throws(() => parseArgs(['--batch-size=101']), /100 이하/);
  assert.throws(() => parseArgs(['--unknown']), /지원하지 않는/);
  assert.match(usage(), /--dry-run/);
});

test('requires live credentials only for a writing run', () => {
  assert.doesNotThrow(() => validateRuntimeConfiguration({}, { dryRun: true }));
  assert.throws(
    () => validateRuntimeConfiguration({}, { dryRun: false }),
    /OPENROUTER_API_KEY/,
  );
  assert.throws(
    () => validateRuntimeConfiguration(
      { OPENROUTER_API_KEY: 'configured' },
      { dryRun: false },
    ),
    /QDRANT_URL/,
  );
  assert.doesNotThrow(() => validateRuntimeConfiguration(
    { OPENROUTER_API_KEY: 'configured', QDRANT_URL: 'https://qdrant.test' },
    { dryRun: false },
  ));
});

test('sanitizes operational failures without printing URLs or credentials', () => {
  const error = new Error('https://secret.example?api-key=private');
  error.code = 'QDRANT_REQUEST_FAILED';
  assert.equal(safeFailure(error), 'RAG 장소 인덱싱 실패 (QDRANT_REQUEST_FAILED)');
  assert.doesNotMatch(safeFailure(error), /secret|private|https/);
});
