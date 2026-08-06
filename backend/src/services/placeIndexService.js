'use strict';

const placeCacheRepository = require('../repositories/placeCacheRepository');
const { getRagIndexConfig } = require('../config/ragIndex');
const {
  INDEX_NAMESPACE,
  buildPlaceIndexDocument,
} = require('./placeIndexDocument');

const PAYLOAD_INDEXES = Object.freeze([
  Object.freeze({ fieldName: 'cultures', fieldSchema: 'keyword' }),
  Object.freeze({ fieldName: 'regionName', fieldSchema: 'keyword' }),
  Object.freeze({ fieldName: 'areaCode', fieldSchema: 'keyword' }),
  Object.freeze({ fieldName: 'lDongRegnCd', fieldSchema: 'keyword' }),
  Object.freeze({ fieldName: 'lDongSignguCd', fieldSchema: 'keyword' }),
  Object.freeze({ fieldName: 'contentTypeId', fieldSchema: 'keyword' }),
  Object.freeze({ fieldName: 'indexNamespace', fieldSchema: 'keyword' }),
]);

function positiveInteger(value, name, fallback, maximum = Number.MAX_SAFE_INTEGER) {
  if (value === undefined || value === null) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new TypeError(`${name}는 1 이상 ${maximum} 이하의 정수여야 합니다.`);
  }
  return parsed;
}

function chunks(items, size) {
  const result = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function createPlaceIndexService(options = {}) {
  const config = options.config || getRagIndexConfig(options.env || process.env);
  const repository = options.placeRepository || placeCacheRepository;
  const embeddingClient = options.embeddingClient;
  const qdrantClient = options.qdrantClient;
  const now = options.now || (() => new Date());

  async function indexBatch(documents, result) {
    const existing = await qdrantClient.retrievePoints(
      documents.map(document => document.pointId),
    );
    const existingContracts = new Map(existing.map(point => [
      String(point.id),
      {
        documentHash: String(point.payload?.documentHash || ''),
        embeddingModel: String(point.payload?.embeddingModel || ''),
      },
    ]));
    const changed = documents.filter(document => {
      const current = existingContracts.get(document.pointId);
      return current?.documentHash !== document.documentHash ||
        current?.embeddingModel !== config.embeddingModel;
    });
    result.unchanged += documents.length - changed.length;
    if (!changed.length) return;

    const embedded = await embeddingClient.embedMany(
      changed.map(document => document.content),
      { expectedDimensions: config.embeddingDimensions },
    );
    if (!embedded || !Array.isArray(embedded.embeddings) ||
        embedded.embeddings.length !== changed.length) {
      throw new TypeError('임베딩 결과 개수가 장소 문서 개수와 일치하지 않습니다.');
    }
    const indexedAt = now().toISOString();
    await qdrantClient.upsertPoints(changed.map((document, index) => ({
      id: document.pointId,
      payload: {
        ...document.payload,
        embeddingModel: config.embeddingModel,
        indexedAt,
      },
      vector: embedded.embeddings[index],
    })));
    result.embedded += changed.length;
    result.inputTokens += Number(embedded.usage?.inputTokens || 0);
  }

  async function pruneMissing(sourcePointIds, result, batchSize) {
    if (sourcePointIds.size === 0) {
      throw new Error('원본 장소가 비어 있어 Qdrant prune을 거부했습니다.');
    }
    const staleIds = [];
    let offset = null;
    do {
      const previousOffset = offset;
      const page = await qdrantClient.scrollPoints({
        filter: {
          must: [{ key: 'indexNamespace', match: { value: INDEX_NAMESPACE } }],
        },
        limit: 256,
        offset,
      });
      for (const point of page.points) {
        if (!sourcePointIds.has(String(point.id))) staleIds.push(point.id);
      }
      offset = page.nextOffset;
      if (offset !== null && offset !== undefined &&
          String(offset) === String(previousOffset)) {
        throw new Error('Qdrant scroll cursor가 진행되지 않았습니다.');
      }
    } while (offset !== null && offset !== undefined);

    for (const batch of chunks(staleIds, batchSize)) {
      await qdrantClient.deletePoints(batch);
    }
    result.pruned = staleIds.length;
  }

  async function run(runOptions = {}) {
    const dryRun = runOptions.dryRun === true;
    const prune = runOptions.prune === true;
    const limit = runOptions.limit === undefined || runOptions.limit === null
      ? null
      : positiveInteger(runOptions.limit, 'limit', null);
    const batchSize = positiveInteger(
      runOptions.batchSize,
      'batchSize',
      config.batchSize,
      100,
    );
    if (prune && (dryRun || limit !== null)) {
      throw new TypeError('prune은 limit과 dry-run 없이 전체 인덱싱할 때만 사용할 수 있습니다.');
    }
    if (!dryRun && (!embeddingClient || !qdrantClient)) {
      throw new TypeError('실제 인덱싱에는 OpenRouter와 Qdrant 클라이언트가 필요합니다.');
    }

    const result = {
      collection: config.collection,
      dryRun,
      eligible: 0,
      embedded: 0,
      inputTokens: 0,
      model: config.embeddingModel,
      pruned: 0,
      scanned: 0,
      unchanged: 0,
    };
    if (!dryRun) {
      await qdrantClient.ensureCollection({
        distance: config.distance,
        payloadIndexes: PAYLOAD_INDEXES,
        vectorSize: config.embeddingDimensions,
      });
    }

    const sourcePointIds = new Set();
    let cursor = null;
    while (limit === null || result.scanned < limit) {
      const remaining = limit === null ? config.pageSize : limit - result.scanned;
      const page = await repository.listPlacesPage({
        afterContentId: cursor,
        limit: Math.min(config.pageSize, remaining),
      });
      if (!page || !Array.isArray(page.items)) {
        throw new TypeError('장소 repository 페이지 응답이 올바르지 않습니다.');
      }
      if (!page.items.length) break;

      const selectedItems = page.items.slice(0, remaining);
      const documents = selectedItems.map(buildPlaceIndexDocument);
      result.scanned += selectedItems.length;
      result.eligible += documents.length;
      for (const document of documents) sourcePointIds.add(document.pointId);
      if (!dryRun) {
        for (const batch of chunks(documents, batchSize)) {
          await indexBatch(batch, result);
        }
      }

      if (!page.nextCursor || result.scanned >= (limit || Number.MAX_SAFE_INTEGER)) break;
      if (String(page.nextCursor) === String(cursor)) {
        throw new Error('장소 repository cursor가 진행되지 않았습니다.');
      }
      cursor = String(page.nextCursor);
    }

    if (prune) await pruneMissing(sourcePointIds, result, batchSize);
    return Object.freeze(result);
  }

  return Object.freeze({ run });
}

module.exports = { PAYLOAD_INDEXES, createPlaceIndexService };
