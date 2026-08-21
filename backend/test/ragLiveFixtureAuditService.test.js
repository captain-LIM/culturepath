'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { loadDataset } = require('../scripts/evaluateRag');
const {
  auditRagLiveFixture,
  collectExpectations,
} = require('../src/services/ragLiveFixtureAuditService');

function cachedPlacesFor(dataset) {
  return collectExpectations(dataset).map(expectation => ({
    contentId: expectation.contentId,
    summary: {
      contentId: expectation.contentId,
      cultures: [...expectation.expectedCategories],
      title: [...expectation.expectedTitlesByLocale.ko][0],
    },
    translations: {},
  }));
}

test('audits live fixture IDs and keeps repository snapshots pending approval', async () => {
  const dataset = loadDataset('live');
  const places = cachedPlacesFor(dataset);
  const result = await auditRagLiveFixture({
    dataset,
    findExistingPlaces: async contentIds => {
      assert.equal(contentIds.length, 13);
      return places;
    },
  });

  assert.equal(result.auditedContentIds, 13);
  assert.equal(result.foundContentIds, 13);
  assert.equal(result.issueCount, 0);
  assert.equal(result.pendingVerificationCases, 15);
  assert.equal(result.readyForApproval, false);
});

test('marks a fixture ready only after MySQL verification and detects stale culture evidence', async () => {
  const dataset = loadDataset('live');
  for (const item of dataset.cases) item.evidence.verification = 'mysql_verified';
  const places = cachedPlacesFor(dataset);
  const clean = await auditRagLiveFixture({
    dataset,
    findExistingPlaces: async () => places,
  });
  assert.equal(clean.readyForApproval, true);

  const changedPlaces = structuredClone(places);
  changedPlaces.find(item => item.contentId === '2369504').summary.cultures = [];
  changedPlaces.find(item => item.contentId === '129784').summary.cultures = ['문학'];
  const stale = await auditRagLiveFixture({
    dataset,
    findExistingPlaces: async () => changedPlaces,
  });
  assert.equal(stale.readyForApproval, false);
  assert.ok(stale.results.some(item =>
    item.issues.includes('EXPECTED_CATEGORY_MISSING:문학')));
  assert.ok(stale.results.some(item =>
    item.issues.includes('COVERAGE_GAP_RESOLVED:문학')));
});

test('reports missing places_cache rows without inventing fallback data', async () => {
  const dataset = loadDataset('live');
  const result = await auditRagLiveFixture({
    dataset,
    findExistingPlaces: async () => [],
  });

  assert.equal(result.foundContentIds, 0);
  assert.equal(result.issueCount, 13);
  assert.ok(result.results.every(item => item.issues[0] === 'MISSING_FROM_PLACES_CACHE'));
});

test('audits locale titles and detects missing or resolved translation evidence', async () => {
  const dataset = loadDataset('live');
  for (const item of dataset.cases) item.evidence.verification = 'mysql_verified';
  dataset.cases[0].expected.titlesByLocale.en = ['Ojukheon'];
  const gap = dataset.cases.find(item => item.id === 'live-gap-yourmind-bookshop');
  gap.expected.coverageGapReason = 'MISSING_TRANSLATION';
  gap.expected.coverageGapLocale = 'ja';
  gap.expected.titlesByLocale.ja = ['ユアマインド'];

  const places = cachedPlacesFor(dataset);
  const ojukheon = places.find(item => item.contentId === '129784');
  ojukheon.translations.en = { detail: null };
  const yourmind = places.find(item => item.contentId === '2044896');
  yourmind.translations.ja = { detail: null };

  const missing = await auditRagLiveFixture({
    dataset,
    findExistingPlaces: async () => places,
  });
  assert.ok(missing.results.find(item => item.contentId === '129784').issues
    .includes('EXPECTED_LOCALE_TITLE_MISSING:en'));
  assert.equal(
    missing.results.find(item => item.contentId === '2044896').localeTitles.ja.missing,
    true,
  );

  ojukheon.translations.en.detail = { title: 'Ojukheon Museum' };
  yourmind.translations.ja.detail = { title: 'ユアマインド' };
  const changed = await auditRagLiveFixture({
    dataset,
    findExistingPlaces: async () => places,
  });
  const english = changed.results.find(item => item.contentId === '129784').localeTitles.en;
  assert.equal(english.missing, false);
  assert.equal(english.matchesSnapshot, false);
  assert.ok(changed.results.find(item => item.contentId === '2044896').issues
    .includes('COVERAGE_GAP_RESOLVED:MISSING_TRANSLATION:ja'));
});

test('keeps locale title snapshots associated with each expected contentId', async () => {
  const dataset = loadDataset('live');
  const places = cachedPlacesFor(dataset);
  const firstMuseum = places.find(item => item.contentId === '1934593');
  const secondMuseum = places.find(item => item.contentId === '130227');
  assert.equal(firstMuseum.summary.title, '국립현대미술관 서울관');
  assert.equal(secondMuseum.summary.title, '일민미술관');

  secondMuseum.summary.title = firstMuseum.summary.title;
  const result = await auditRagLiveFixture({
    dataset,
    findExistingPlaces: async () => places,
  });
  assert.equal(
    result.results.find(item => item.contentId === '1934593').titleMatchesSnapshot,
    true,
  );
  assert.equal(
    result.results.find(item => item.contentId === '130227').titleMatchesSnapshot,
    false,
  );
});
