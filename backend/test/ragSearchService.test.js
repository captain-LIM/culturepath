'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createRagSearchService } = require('../src/services/ragSearchService');

function cachedPlace(contentId, overrides = {}) {
  return {
    contentId,
    summary: {
      contentId,
      contentTypeId: '14',
      title: `장소 ${contentId}`,
      address: '경남 통영시',
      lDongRegnCd: '48',
      lDongSignguCd: '220',
      cultures: ['문학'],
      ...overrides.summary,
    },
    detail: { overview: '신뢰 가능한 소개', ...overrides.detail },
  };
}

test('deduplicates and rehydrates Qdrant results from trusted MySQL places', async () => {
  const service = createRagSearchService({
    vectorStore: {
      async searchDetailed() {
        return {
          documents: [
            { id: 'p1', score: 0.9, metadata: { contentId: '100', place_name: '위조 제목' } },
            { id: 'p2', score: 0.8, metadata: { contentId: '100' } },
            { id: 'p3', score: 0.7, metadata: { contentId: '200' } },
            { id: 'p4', score: 0.6, metadata: { contentId: 'bad-id' } },
          ],
          diagnostics: { source: 'qdrant', warnings: [] },
        };
      },
    },
    placeRepository: {
      async findExistingPlaces(ids) {
        assert.deepEqual(ids, ['100', '200']);
        return [cachedPlace('100')];
      },
    },
  });

  const result = await service.search('통영 문학', { minResults: 2 }, {
    env: { USE_MOCK_RAG: 'false' },
  });
  assert.equal(result.documents.length, 1);
  assert.equal(result.documents[0].metadata.place_name, '장소 100');
  assert.equal(result.documents[0].metadata.trustedSource, true);
  assert.equal(result.diagnostics.dropped.duplicateContentId, 1);
  assert.equal(result.diagnostics.dropped.invalidContentId, 1);
  assert.equal(result.diagnostics.dropped.missingSource, 1);
  assert.equal(result.diagnostics.shortage, true);
  assert.equal(result.diagnostics.filters.filtersRelaxed, false);
});

test('drops trusted rows that no longer satisfy hard filters', async () => {
  const service = createRagSearchService({
    vectorStore: {
      async searchDetailed() {
        return {
          documents: [{ id: 'p1', score: 0.9, metadata: { contentId: '100' } }],
          diagnostics: { source: 'qdrant', warnings: [] },
        };
      },
    },
    placeRepository: {
      async findExistingPlaces() {
        return [cachedPlace('100', { summary: { cultures: ['음악'] } })];
      },
    },
  });
  const result = await service.search('통영 문학', {}, {
    env: { USE_MOCK_RAG: 'false' },
  });
  assert.deepEqual(result.documents, []);
  assert.equal(result.diagnostics.dropped.filterMismatch, 1);
  assert.ok(result.diagnostics.warnings.includes('NO_TRUSTED_RESULTS'));
});

test('does not require MySQL while the explicit mock mode is active', async () => {
  const service = createRagSearchService({
    vectorStore: {
      async searchDetailed() {
        return {
          documents: [{ id: 'mock', score: 1, metadata: { place_name: 'Mock 장소' } }],
          diagnostics: { source: 'mock', warnings: [] },
        };
      },
    },
    placeRepository: {
      async findExistingPlaces() { throw new Error('must not run'); },
    },
  });
  const result = await service.search('통영 문학', {}, { env: { USE_MOCK_RAG: 'true' } });
  assert.equal(result.documents[0].metadata.place_name, 'Mock 장소');
  assert.equal(result.diagnostics.trustedSourceRate, null);
});
