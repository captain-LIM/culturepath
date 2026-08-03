'use strict';

const DEFAULTS = Object.freeze({
  batchSize: 32,
  collection: 'culturepath_places_v1',
  distance: 'Cosine',
  embeddingDimensions: 1024,
  embeddingModel: 'baai/bge-m3',
  pageSize: 200,
});

const KNOWN_MODEL_DIMENSIONS = Object.freeze({
  'baai/bge-m3': 1024,
});

function parseBoundedPositiveInteger(value, name, fallback, maximum) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new TypeError(`${name}는 1 이상 ${maximum} 이하의 정수여야 합니다.`);
  }
  return parsed;
}

function getRagIndexConfig(env = process.env) {
  const embeddingModel = String(
    env.OPENROUTER_EMBEDDING_MODEL || DEFAULTS.embeddingModel,
  ).trim();
  const embeddingDimensions = parseBoundedPositiveInteger(
    env.OPENROUTER_EMBEDDING_DIMENSIONS,
    'OPENROUTER_EMBEDDING_DIMENSIONS',
    DEFAULTS.embeddingDimensions,
    8192,
  );
  const knownDimensions = KNOWN_MODEL_DIMENSIONS[embeddingModel];
  if (knownDimensions && embeddingDimensions !== knownDimensions) {
    throw new TypeError(
      `${embeddingModel}의 벡터 차원은 ${knownDimensions}이어야 합니다.`,
    );
  }

  const collection = String(env.QDRANT_COLLECTION || DEFAULTS.collection).trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,254}$/.test(collection)) {
    throw new TypeError('QDRANT_COLLECTION 이름이 올바르지 않습니다.');
  }
  if (collection === DEFAULTS.collection && embeddingModel !== DEFAULTS.embeddingModel) {
    throw new TypeError(
      `${DEFAULTS.collection}은 ${DEFAULTS.embeddingModel} 전용입니다. 모델 변경 시 컬렉션 버전을 올리세요.`,
    );
  }

  return Object.freeze({
    batchSize: parseBoundedPositiveInteger(
      env.RAG_INDEX_BATCH_SIZE,
      'RAG_INDEX_BATCH_SIZE',
      DEFAULTS.batchSize,
      100,
    ),
    collection,
    distance: DEFAULTS.distance,
    embeddingDimensions,
    embeddingModel,
    pageSize: parseBoundedPositiveInteger(
      env.RAG_INDEX_PAGE_SIZE,
      'RAG_INDEX_PAGE_SIZE',
      DEFAULTS.pageSize,
      1000,
    ),
  });
}

module.exports = { DEFAULTS, KNOWN_MODEL_DIMENSIONS, getRagIndexConfig };
