'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { VectorStoreError, createQdrantClient } = require('../src/services/qdrantClient');

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return body; },
  };
}

test('creates a missing collection before payload indexes without exposing credentials', async () => {
  const requests = [];
  const client = createQdrantClient({
    env: {
      QDRANT_URL: 'https://qdrant.test',
      QDRANT_API_KEY: 'secret-key',
      QDRANT_COLLECTION: 'culturepath_places_v1',
    },
    fetchImpl: async (url, options) => {
      const body = options.body ? JSON.parse(options.body) : null;
      requests.push({ url, method: options.method, body });
      if (options.method === 'GET') return jsonResponse({ status: 'not found' }, 404);
      return jsonResponse({ result: { status: 'completed' } });
    },
  });

  const result = await client.ensureCollection({
    vectorSize: 1024,
    distance: 'Cosine',
    payloadIndexes: [{ fieldName: 'cultures', fieldSchema: 'keyword' }],
  });

  assert.equal(result.created, true);
  assert.deepEqual(requests[1].body, { vectors: { distance: 'Cosine', size: 1024 } });
  assert.deepEqual(requests[2].body, {
    field_name: 'cultures',
    field_schema: 'keyword',
  });
  assert.equal(JSON.stringify(requests).includes('secret-key'), false);
});

test('rejects an existing collection with an incompatible vector contract', async () => {
  const client = createQdrantClient({
    env: { QDRANT_URL: 'https://qdrant.test', QDRANT_COLLECTION: 'places' },
    fetchImpl: async () => jsonResponse({
      result: { config: { params: { vectors: { size: 768, distance: 'Cosine' } } } },
    }),
  });
  await assert.rejects(
    client.ensureCollection({ vectorSize: 1024 }),
    error => error instanceof VectorStoreError &&
      error.code === 'QDRANT_COLLECTION_INCOMPATIBLE',
  );
});

test('reuses compatible payload indexes and rejects incompatible field types', async () => {
  let calls = 0;
  const response = dataType => jsonResponse({
    result: {
      config: { params: { vectors: { size: 1024, distance: 'Cosine' } } },
      payload_schema: { cultures: { data_type: dataType } },
    },
  });
  const compatible = createQdrantClient({
    env: { QDRANT_URL: 'https://qdrant.test', QDRANT_COLLECTION: 'places' },
    fetchImpl: async () => { calls += 1; return response('keyword'); },
  });
  await compatible.ensureCollection({
    vectorSize: 1024,
    payloadIndexes: [{ fieldName: 'cultures', fieldSchema: 'keyword' }],
  });
  assert.equal(calls, 1);

  const incompatible = createQdrantClient({
    env: { QDRANT_URL: 'https://qdrant.test', QDRANT_COLLECTION: 'places' },
    fetchImpl: async () => response('integer'),
  });
  await assert.rejects(
    incompatible.ensureCollection({
      vectorSize: 1024,
      payloadIndexes: [{ fieldName: 'cultures', fieldSchema: 'keyword' }],
    }),
    error => error instanceof VectorStoreError &&
      error.code === 'QDRANT_COLLECTION_INCOMPATIBLE',
  );
});

test('retrieves, upserts, scrolls, and deletes points with bounded contracts', async () => {
  const requests = [];
  const client = createQdrantClient({
    env: { QDRANT_URL: 'https://qdrant.test', QDRANT_COLLECTION: 'places' },
    fetchImpl: async (url, options) => {
      requests.push({ url, method: options.method, body: JSON.parse(options.body) });
      if (url.endsWith('/points') && options.method === 'POST') {
        return jsonResponse({ result: [{ id: 'one', payload: { documentHash: 'hash' } }] });
      }
      if (url.endsWith('/points/scroll')) {
        return jsonResponse({ result: { points: [{ id: 'one' }], next_page_offset: 'two' } });
      }
      return jsonResponse({ result: { status: 'completed' } });
    },
  });

  assert.equal((await client.retrievePoints(['one'])).length, 1);
  await client.upsertPoints([{ id: 'one', vector: [0.1], payload: {} }]);
  const page = await client.scrollPoints({ offset: 'start', limit: 20 });
  assert.deepEqual(page, { points: [{ id: 'one' }], nextOffset: 'two' });
  await client.deletePoints(['one']);
  assert.equal(requests.length, 4);
  assert.deepEqual(requests[0].body, {
    ids: ['one'],
    with_payload: true,
    with_vector: false,
  });
  assert.deepEqual(requests[3].body, { points: ['one'] });
});

test('rejects 2xx mutation responses that do not confirm Qdrant success', async () => {
  const client = createQdrantClient({
    env: { QDRANT_URL: 'https://qdrant.test', QDRANT_COLLECTION: 'places' },
    fetchImpl: async () => jsonResponse({ status: 'error', result: null }),
  });

  await assert.rejects(
    client.upsertPoints([{ id: 'one', vector: [0.1], payload: {} }]),
    error => error instanceof VectorStoreError &&
      error.code === 'QDRANT_INVALID_RESPONSE',
  );
  await assert.rejects(
    client.deletePoints(['one']),
    error => error instanceof VectorStoreError &&
      error.code === 'QDRANT_INVALID_RESPONSE',
  );
});
