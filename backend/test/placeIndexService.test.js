'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { buildPlaceIndexDocument } = require('../src/services/placeIndexDocument');
const { createPlaceIndexService } = require('../src/services/placeIndexService');

const config = Object.freeze({
  batchSize: 2,
  collection: 'culturepath_places_v1',
  distance: 'Cosine',
  embeddingDimensions: 3,
  embeddingModel: 'test/embed',
  pageSize: 2,
});

function place(contentId, title = `장소 ${contentId}`) {
  return {
    contentId,
    summary: {
      contentId,
      contentTypeId: '14',
      title,
      address: '경남 통영시',
      lDongRegnCd: '48',
      lDongSignguCd: '220',
      cultures: ['문학'],
      sourceUpdatedAt: '20260801',
    },
    detail: null,
  };
}

test('indexes only new or changed documents and resumes through cursor pages', async () => {
  const source = [place('1'), place('2'), place('3')];
  const firstDocument = buildPlaceIndexDocument(source[0]);
  const repositoryCalls = [];
  const placeRepository = {
    async listPlacesPage({ afterContentId, limit }) {
      repositoryCalls.push({ afterContentId, limit });
      if (afterContentId === null) return { items: source.slice(0, 2), nextCursor: '2' };
      return { items: source.slice(2), nextCursor: null };
    },
  };
  const events = [];
  const qdrantClient = {
    async ensureCollection(input) { events.push({ type: 'ensure', input }); },
    async retrievePoints(ids) {
      events.push({ type: 'retrieve', ids });
      return ids.includes(firstDocument.pointId)
        ? [{
            id: firstDocument.pointId,
            payload: {
              documentHash: firstDocument.documentHash,
              embeddingModel: 'test/embed',
            },
          }]
        : [];
    },
    async upsertPoints(points) { events.push({ type: 'upsert', points }); },
  };
  const embeddingCalls = [];
  const embeddingClient = {
    async embedMany(inputs, options) {
      embeddingCalls.push({ inputs, options });
      return {
        embeddings: inputs.map(() => [0.1, 0.2, 0.3]),
        usage: { inputTokens: inputs.length * 10 },
      };
    },
  };
  const service = createPlaceIndexService({
    config,
    embeddingClient,
    now: () => new Date('2026-08-03T00:00:00.000Z'),
    placeRepository,
    qdrantClient,
  });

  const result = await service.run();

  assert.deepEqual(result, {
    collection: 'culturepath_places_v1',
    dryRun: false,
    eligible: 3,
    embedded: 2,
    inputTokens: 20,
    model: 'test/embed',
    pruned: 0,
    scanned: 3,
    unchanged: 1,
  });
  assert.deepEqual(repositoryCalls, [
    { afterContentId: null, limit: 2 },
    { afterContentId: '2', limit: 2 },
  ]);
  assert.equal(embeddingCalls.length, 2);
  assert.deepEqual(embeddingCalls[0].options, { expectedDimensions: 3 });
  assert.deepEqual(
    events.find(event => event.type === 'ensure').input.payloadIndexes
      .map(index => index.fieldName),
    [
      'cultures',
      'regionName',
      'areaCode',
      'lDongRegnCd',
      'lDongSignguCd',
      'contentTypeId',
      'indexNamespace',
    ],
  );
  assert.equal(events.filter(event => event.type === 'upsert').length, 2);
  assert.equal(events.find(event => event.type === 'upsert').points[0].payload.embeddingModel, 'test/embed');
});

test('dry-run reads and validates source data without external clients', async () => {
  let reads = 0;
  const service = createPlaceIndexService({
    config,
    placeRepository: {
      async listPlacesPage() {
        reads += 1;
        return { items: [place('1'), place('2')], nextCursor: null };
      },
    },
  });
  const result = await service.run({ dryRun: true, limit: 1 });
  assert.equal(reads, 1);
  assert.equal(result.scanned, 1);
  assert.equal(result.eligible, 1);
  assert.equal(result.embedded, 0);
});

test('prunes only explicit namespace points after a complete non-empty scan', async () => {
  const current = place('1');
  const currentId = buildPlaceIndexDocument(current).pointId;
  const deleted = [];
  const qdrantClient = {
    async ensureCollection() {},
    async retrievePoints() {
      return [{
        id: currentId,
        payload: {
          documentHash: buildPlaceIndexDocument(current).documentHash,
          embeddingModel: 'test/embed',
        },
      }];
    },
    async scrollPoints({ offset }) {
      if (offset === null) {
        return {
          points: [{ id: currentId }, { id: 'stale-id' }],
          nextOffset: null,
        };
      }
      throw new Error('unexpected page');
    },
    async deletePoints(ids) { deleted.push(...ids); },
  };
  const service = createPlaceIndexService({
    config,
    embeddingClient: { async embedMany() { throw new Error('unchanged'); } },
    placeRepository: {
      async listPlacesPage() { return { items: [current], nextCursor: null }; },
    },
    qdrantClient,
  });
  const result = await service.run({ prune: true });
  assert.deepEqual(deleted, ['stale-id']);
  assert.equal(result.pruned, 1);
  await assert.rejects(service.run({ prune: true, limit: 1 }), /전체 인덱싱/);
});
