'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { DEFAULTS, getRagIndexConfig } = require('../src/config/ragIndex');

test('uses the versioned BGE-M3 indexing contract by default', () => {
  const config = getRagIndexConfig({});
  assert.deepEqual(config, {
    batchSize: 32,
    collection: 'culturepath_places_v1',
    distance: 'Cosine',
    embeddingDimensions: 1024,
    embeddingModel: 'baai/bge-m3',
    pageSize: 200,
  });
  assert.equal(DEFAULTS.embeddingDimensions, 1024);
});

test('validates known model dimensions, collection names, and bounded batches', () => {
  assert.throws(
    () => getRagIndexConfig({
      OPENROUTER_EMBEDDING_MODEL: 'baai/bge-m3',
      OPENROUTER_EMBEDDING_DIMENSIONS: '768',
    }),
    /벡터 차원은 1024/,
  );
  assert.throws(
    () => getRagIndexConfig({ QDRANT_COLLECTION: '../unsafe' }),
    /이름이 올바르지/,
  );
  assert.throws(
    () => getRagIndexConfig({ RAG_INDEX_BATCH_SIZE: '101' }),
    /100 이하/,
  );
  assert.throws(
    () => getRagIndexConfig({
      OPENROUTER_EMBEDDING_MODEL: 'another/model',
      QDRANT_COLLECTION: 'culturepath_places_v1',
    }),
    /모델 변경 시 컬렉션 버전/,
  );
});
