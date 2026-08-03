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
