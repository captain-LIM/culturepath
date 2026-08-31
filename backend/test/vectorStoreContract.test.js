'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const vectorStore = require('../src/services/vectorStore');

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return body; },
  };
}

test('rejects a different embedding model for the v1 collection before searching', async () => {
  let searched = false;
  await assert.rejects(
    vectorStore.search('query', {}, {
      env: {
        USE_MOCK_AI: 'false',
        USE_MOCK_RAG: 'false',
        OPENROUTER_EMBEDDING_MODEL: 'another/model',
        QDRANT_COLLECTION: 'culturepath_places_v1',
      },
      qdrantClient: {
        async search() { searched = true; return []; },
      },
    }),
    TypeError,
  );
  assert.equal(searched, false);
});

test('validates search embeddings against the collection dimension contract', async () => {
  let embeddingOptions;
  const result = await vectorStore.search('query', {}, {
    env: {
      USE_MOCK_AI: 'false',
      USE_MOCK_RAG: 'false',
      OPENROUTER_EMBEDDING_MODEL: 'baai/bge-m3',
      OPENROUTER_EMBEDDING_DIMENSIONS: '1024',
      QDRANT_COLLECTION: 'culturepath_places_v1',
      QDRANT_URL: 'https://qdrant.test',
    },
    openRouterClient: {
      async embed(_input, options) {
        embeddingOptions = options;
        return [0.1, 0.2];
      },
    },
    fetchImpl: async () => jsonResponse({ result: { points: [] } }),
  });

  assert.deepEqual(result, []);
  assert.deepEqual(embeddingOptions, { expectedDimensions: 1024 });
});

test('fails explicitly when a live Qdrant collection has no indexed points', async () => {
  await assert.rejects(
    vectorStore.searchDetailed('통영 문학', {}, {
      env: {
        USE_MOCK_AI: 'false',
        USE_MOCK_RAG: 'false',
        QDRANT_COLLECTION: 'culturepath_places_v1',
      },
      qdrantClient: {
        async getCollection() { return { points_count: 0 }; },
        async searchDetailed() {
          return {
            documents: [],
            diagnostics: {
              latencyMs: { embedding: 1, qdrant: 1, total: 2 },
              usage: { embeddingModel: 'baai/bge-m3', inputTokens: 1 },
            },
          };
        },
      },
    }),
    error => error.code === 'QDRANT_INDEX_EMPTY',
  );
});

test('applies content type and score threshold strictly in mock mode', async () => {
  const filtered = await vectorStore.searchDetailed('통영 문화시설', {
    contentTypeId: '14',
    region: '통영',
    scoreThreshold: null,
  }, { env: { USE_MOCK_RAG: 'true' } });
  assert.ok(filtered.documents.length > 0);
  assert.ok(filtered.documents.every(document => document.metadata.contentTypeId === '14'));
  assert.equal(filtered.diagnostics.filters.filtersRelaxed, false);

  const empty = await vectorStore.searchDetailed('통영 여행', {
    contentTypeId: '39',
    region: '통영',
    scoreThreshold: 0.8,
  }, { env: { USE_MOCK_RAG: 'true' } });
  assert.deepEqual(empty.documents, []);
});
