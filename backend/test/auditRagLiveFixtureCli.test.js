'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { main, safeFailure } = require('../scripts/auditRagLiveFixture');
const { loadDataset } = require('../scripts/evaluateRag');
const { collectExpectations } = require('../src/services/ragLiveFixtureAuditService');

function verifiedDatasetAndPlaces() {
  const dataset = loadDataset('live');
  for (const item of dataset.cases) item.evidence.verification = 'mysql_verified';
  const places = collectExpectations(dataset).map(expectation => ({
    contentId: expectation.contentId,
    summary: {
      cultures: [...expectation.expectedCategories],
      title: [...expectation.expectedTitlesByLocale.ko][0],
    },
    translations: {},
  }));
  return { dataset, places };
}

test('closes an injected audit resource after a successful MySQL-style lookup', async () => {
  const { dataset, places } = verifiedDatasetAndPlaces();
  let closeCalls = 0;
  let output = '';
  const result = await main({
    close: async () => { closeCalls += 1; },
    dataset,
    repository: { findExistingPlaces: async () => places },
    stdout: { write: value => { output += value; } },
  });

  assert.equal(result.readyForApproval, true);
  assert.equal(closeCalls, 1);
  assert.match(output, /"readyForApproval": true/);
});

test('closes an injected audit resource when the cache lookup fails', async () => {
  const { dataset } = verifiedDatasetAndPlaces();
  let closeCalls = 0;
  await assert.rejects(() => main({
    close: async () => { closeCalls += 1; },
    dataset,
    repository: {
      findExistingPlaces: async () => {
        const error = new Error('secret connection detail');
        error.code = 'ECONNREFUSED';
        throw error;
      },
    },
    stdout: { write: () => {} },
  }), /secret connection detail/);
  assert.equal(closeCalls, 1);
});

test('sanitizes audit CLI failures', () => {
  const error = new Error('mysql://user:password@private-host');
  error.code = 'ECONNREFUSED';
  assert.equal(safeFailure(error), 'live RAG fixture 감사 실패 (ECONNREFUSED)');
  assert.doesNotMatch(safeFailure(error), /password|private-host|mysql:/);
});
