'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createQdrantClient } = require('../src/services/qdrantClient');
const { VectorStoreError } = require('../src/services/qdrantClient');

test('queries Qdrant with culture and region filters and normalizes payloads', async () => {
  let captured;
  const client = createQdrantClient({
    env: {
      QDRANT_URL: 'https://qdrant.test',
      QDRANT_API_KEY: 'secret-qdrant-key',
      QDRANT_COLLECTION: 'places_v1',
      QDRANT_TIMEOUT_MS: '1000',
      QDRANT_SCORE_THRESHOLD: '0.4',
    },
    embed: async () => [0.1, 0.2],
    fetchImpl: async (url, options) => {
      captured = { url, options, body: JSON.parse(options.body) };
      return {
        ok: true,
        async json() {
          return {
            result: {
              points: [{
                id: 1,
                score: 0.91,
                payload: {
                  contentId: '12345',
                  title: '박경리기념관',
                  overview: '문학 장소',
                  cultures: ['문학'],
                  regionName: '통영',
                },
              }],
            },
          };
        },
      };
    },
  });

  const result = await client.search('통영 문학', {
    category: '문학',
    contentTypeId: '14',
    region: '통영',
    topK: 3,
  });
  assert.equal(captured.url, 'https://qdrant.test/collections/places_v1/points/query');
  assert.deepEqual(captured.body.query, [0.1, 0.2]);
  assert.deepEqual(captured.body.filter.must, [
    { key: 'cultures', match: { value: '문학' } },
    { key: 'regionName', match: { value: '통영' } },
    { key: 'contentTypeId', match: { value: '14' } },
  ]);
  assert.equal(captured.body.score_threshold, 0.4);
  assert.equal(result[0].metadata.contentId, '12345');
  assert.equal(result[0].metadata.place_name, '박경리기념관');
  assert.equal(JSON.stringify(captured.body).includes('secret-qdrant-key'), false);
});

test('reports embedding usage and bounded search latency without changing search()', async () => {
  const timestamps = [10, 15, 25];
  const client = createQdrantClient({
    env: { QDRANT_URL: 'https://qdrant.test', QDRANT_COLLECTION: 'places_v1' },
    embed: async () => ({
      model: 'baai/bge-m3',
      usage: { inputTokens: 7 },
      vector: [0.1, 0.2],
    }),
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      async json() { return { result: { points: [] } }; },
    }),
    now: () => timestamps.shift(),
  });

  const detailed = await client.searchDetailed('query', { scoreThreshold: null, topK: 8 });
  assert.deepEqual(detailed.documents, []);
  assert.deepEqual(detailed.diagnostics.usage, {
    embeddingModel: 'baai/bge-m3',
    inputTokens: 7,
  });
  assert.deepEqual(detailed.diagnostics.latencyMs, { embedding: 5, qdrant: 10, total: 15 });
  await assert.rejects(client.search('query', { topK: 11 }), /10 이하/);
});

test('maps a missing query collection to an explicit empty-index error', async () => {
  const client = createQdrantClient({
    env: { QDRANT_URL: 'https://qdrant.test', QDRANT_COLLECTION: 'missing' },
    embed: async () => [0.1],
    fetchImpl: async () => ({
      ok: false,
      status: 404,
      async json() { return { status: { error: 'not found' } }; },
    }),
  });
  await assert.rejects(
    client.search('query'),
    error => error instanceof VectorStoreError && error.code === 'QDRANT_INDEX_EMPTY',
  );
});

test('rejects malformed and error-shaped successful search envelopes', async () => {
  for (const payload of [
    {},
    { status: { error: 'query failed' } },
    { status: 'ok', result: {} },
    { status: 'failed', result: { points: [] } },
  ]) {
    const client = createQdrantClient({
      env: { QDRANT_URL: 'https://qdrant.test', QDRANT_COLLECTION: 'places_v1' },
      embed: async () => [0.1],
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        async json() { return payload; },
      }),
    });
    await assert.rejects(
      client.search('query'),
      error => error instanceof VectorStoreError && error.code === 'QDRANT_INVALID_RESPONSE',
    );
  }
});

test('keeps the timeout active while parsing the Qdrant response body', async () => {
  const client = createQdrantClient({
    env: {
      QDRANT_URL: 'https://qdrant.test',
      QDRANT_COLLECTION: 'places_v1',
      QDRANT_TIMEOUT_MS: '5',
    },
    embed: async () => [0.1, 0.2],
    fetchImpl: async (_url, options) => ({
      ok: true,
      json: () => new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        });
      }),
    }),
  });

  await assert.rejects(
    client.search('query'),
    error => error instanceof VectorStoreError && error.code === 'QDRANT_TIMEOUT',
  );
});
