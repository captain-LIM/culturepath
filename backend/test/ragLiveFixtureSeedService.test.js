'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { loadDataset } = require('../scripts/evaluateRag');
const { collectExpectations } = require('../src/services/ragLiveFixtureAuditService');
const { seedRagLiveFixture } = require('../src/services/ragLiveFixtureSeedService');

function cachedPlace(expectation) {
  const classificationCodes = {
    130444: ['VE'],
    1950195: ['FD', 'FD05', 'FD050100'],
    913869: ['HS', 'HS01', 'HS011100'],
  };
  return {
    contentId: expectation.contentId,
    summary: {
      contentId: expectation.contentId,
      cultures: [...expectation.expectedCategories],
      lclsSystmCodes: classificationCodes[expectation.contentId] || [],
      title: [...expectation.expectedTitlesByLocale.ko][0],
    },
    translations: {},
  };
}

test('seeds only missing live fixture IDs and audits the persisted result', async () => {
  const dataset = loadDataset('live');
  const expectations = collectExpectations(dataset);
  const places = expectations.slice(0, 2).map(cachedPlace);
  const requested = [];
  const result = await seedRagLiveFixture({
    dataset,
    findExistingPlaces: async contentIds =>
      places.filter(place => contentIds.includes(place.contentId)),
    fetchAndCachePlace: async contentId => {
      requested.push(contentId);
      const expectation = expectations.find(item => item.contentId === contentId);
      places.push(cachedPlace(expectation));
      return { item: places.at(-1).summary };
    },
    updatePlaceCultures: async ({ contentId, cultures, summary }) => {
      const place = places.find(item => item.contentId === contentId);
      place.summary = { ...summary, cultures };
      return true;
    },
  });

  assert.deepEqual(requested, expectations.slice(2).map(item => item.contentId));
  assert.deepEqual(result.skippedContentIds, expectations.slice(0, 2).map(item => item.contentId));
  assert.deepEqual(result.seededContentIds, requested);
  assert.equal(result.audit.issueCount, 0);
  assert.equal(result.audit.pendingVerificationCases, 0);
  assert.equal(result.readyForEvidenceReview, true);
});

test('fails safely when TourAPI returns no item or a different contentId', async () => {
  const dataset = loadDataset('live');
  await assert.rejects(() => seedRagLiveFixture({
    dataset,
    findExistingPlaces: async () => [],
    fetchAndCachePlace: async () => ({ item: null }),
    updatePlaceCultures: async () => true,
  }), error => error.code === 'LIVE_FIXTURE_PLACE_NOT_FOUND');

  await assert.rejects(() => seedRagLiveFixture({
    dataset,
    findExistingPlaces: async () => [],
    fetchAndCachePlace: async () => ({ item: { contentId: '999999' } }),
    updatePlaceCultures: async () => true,
  }), error => error.code === 'LIVE_FIXTURE_CONTENT_ID_MISMATCH');
});

test('keeps partial progress and requests only the remaining IDs on retry', async () => {
  const dataset = loadDataset('live');
  const expectations = collectExpectations(dataset);
  const places = [];
  const firstRequests = [];
  const failedContentId = expectations[2].contentId;

  await assert.rejects(() => seedRagLiveFixture({
    dataset,
    findExistingPlaces: async contentIds =>
      places.filter(place => contentIds.includes(place.contentId)),
    fetchAndCachePlace: async contentId => {
      firstRequests.push(contentId);
      if (contentId === failedContentId) {
        const error = new Error('temporary upstream failure');
        error.code = 'UPSTREAM_FAILURE';
        throw error;
      }
      const expectation = expectations.find(item => item.contentId === contentId);
      const place = cachedPlace(expectation);
      places.push(place);
      return { item: place.summary };
    },
    updatePlaceCultures: async () => true,
  }), error => error.code === 'UPSTREAM_FAILURE');

  assert.deepEqual(
    firstRequests,
    expectations.slice(0, 3).map(item => item.contentId),
  );
  assert.deepEqual(
    places.map(place => place.contentId),
    expectations.slice(0, 2).map(item => item.contentId),
  );

  const retryRequests = [];
  const result = await seedRagLiveFixture({
    dataset,
    findExistingPlaces: async contentIds =>
      places.filter(place => contentIds.includes(place.contentId)),
    fetchAndCachePlace: async contentId => {
      retryRequests.push(contentId);
      const expectation = expectations.find(item => item.contentId === contentId);
      const place = cachedPlace(expectation);
      places.push(place);
      return { item: place.summary };
    },
    updatePlaceCultures: async () => true,
  });

  assert.deepEqual(
    retryRequests,
    expectations.slice(2).map(item => item.contentId),
  );
  assert.equal(result.readyForEvidenceReview, true);
});

test('requires both cache dependencies before doing work', async () => {
  const dataset = loadDataset('live');
  await assert.rejects(() => seedRagLiveFixture({
    dataset,
    findExistingPlaces: async () => [],
    updatePlaceCultures: async () => true,
  }), /fetchAndCachePlace/);
  await assert.rejects(() => seedRagLiveFixture({
    dataset,
    fetchAndCachePlace: async () => ({ item: null }),
    updatePlaceCultures: async () => true,
  }), /findExistingPlaces/);
  await assert.rejects(() => seedRagLiveFixture({
    dataset,
    fetchAndCachePlace: async () => ({ item: null }),
    findExistingPlaces: async () => [],
  }), /updatePlaceCultures/);
});
