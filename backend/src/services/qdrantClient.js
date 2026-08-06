'use strict';

const { performance } = require('node:perf_hooks');
const { DEFAULTS: RAG_INDEX_DEFAULTS } = require('../config/ragIndex');
const { DEFAULTS: RAG_SEARCH_DEFAULTS, optionalScore } = require('../config/ragSearch');

class VectorStoreError extends Error {
  constructor(message, code = 'VECTOR_STORE_ERROR', options = {}) {
    super(message);
    this.name = 'VectorStoreError';
    this.code = code;
    this.status = options.status || null;
  }
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function createQdrantClient(options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const embed = options.embed;
  const baseUrl = String(env.QDRANT_URL || '').replace(/\/+$/, '');
  const collection = String(
    env.QDRANT_COLLECTION || RAG_INDEX_DEFAULTS.collection,
  ).trim();
  const timeoutMs = positiveInteger(env.QDRANT_TIMEOUT_MS, 8000);
  const now = options.now || (() => performance.now());

  function requireConfiguration() {
    if (!baseUrl || !collection || typeof fetchImpl !== 'function') {
      throw new VectorStoreError(
        'Qdrant 설정이 완료되지 않았습니다.',
        'QDRANT_NOT_CONFIGURED',
      );
    }
  }

  async function request(path, requestOptions = {}) {
    requireConfiguration();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    let payload;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        method: requestOptions.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(env.QDRANT_API_KEY ? { 'api-key': env.QDRANT_API_KEY } : {}),
        },
        ...(requestOptions.body === undefined
          ? {}
          : { body: JSON.stringify(requestOptions.body) }),
        signal: controller.signal,
      });
      if (response.status === 204) {
        payload = null;
      } else {
        try {
          payload = await response.json();
        } catch (error) {
          if (controller.signal.aborted || error?.name === 'AbortError') throw error;
          throw new VectorStoreError(
            'Qdrant 응답이 올바르지 않습니다.',
            'QDRANT_INVALID_RESPONSE',
          );
        }
      }
    } catch (error) {
      if (controller.signal.aborted || error?.name === 'AbortError') {
        throw new VectorStoreError('Qdrant 응답 시간이 초과되었습니다.', 'QDRANT_TIMEOUT');
      }
      if (error instanceof VectorStoreError) throw error;
      throw new VectorStoreError('Qdrant에 연결할 수 없습니다.', 'QDRANT_UNAVAILABLE');
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok && !(requestOptions.allowStatuses || []).includes(response.status)) {
      throw new VectorStoreError(
        'Qdrant 요청이 실패했습니다.',
        'QDRANT_REQUEST_FAILED',
        { status: response.status },
      );
    }
    return { payload, response };
  }

  function collectionPath(suffix = '') {
    return `/collections/${encodeURIComponent(collection)}${suffix}`;
  }

  function requireSuccessfulMutation(payload) {
    const envelopeStatus = String(payload?.status || 'ok').toLowerCase();
    const result = payload?.result;
    const operationStatus = String(result?.status || '').toLowerCase();
    if (envelopeStatus !== 'ok' ||
        !(result === true || operationStatus === 'completed' || operationStatus === 'acknowledged')) {
      throw new VectorStoreError(
        'Qdrant write response did not confirm success.',
        'QDRANT_INVALID_RESPONSE',
      );
    }
    return result;
  }

  async function getCollection() {
    const { payload, response } = await request(collectionPath(), {
      allowStatuses: [404],
    });
    return response.status === 404 ? null : payload?.result || null;
  }

  async function ensureCollection({ vectorSize, distance = 'Cosine', payloadIndexes = [] }) {
    if (!Number.isSafeInteger(vectorSize) || vectorSize < 1) {
      throw new TypeError('Qdrant vectorSize는 양의 정수여야 합니다.');
    }
    let current = await getCollection();
    let created = false;
    if (!current) {
      const { payload } = await request(collectionPath(), {
        body: { vectors: { distance, size: vectorSize } },
        method: 'PUT',
      });
      requireSuccessfulMutation(payload);
      created = true;
    } else {
      const vectors = current?.config?.params?.vectors;
      const currentSize = Number(vectors?.size);
      const currentDistance = String(vectors?.distance || '').toLowerCase();
      if (currentSize !== vectorSize || currentDistance !== String(distance).toLowerCase()) {
        throw new VectorStoreError(
          '기존 Qdrant 컬렉션의 벡터 설정이 현재 임베딩 계약과 다릅니다.',
          'QDRANT_COLLECTION_INCOMPATIBLE',
        );
      }
    }

    const payloadSchema = current?.payload_schema || {};
    for (const index of payloadIndexes) {
      if (!index?.fieldName || !index?.fieldSchema) {
        throw new TypeError('Qdrant payload index 설정이 올바르지 않습니다.');
      }
      const existingIndex = payloadSchema[index.fieldName];
      if (existingIndex) {
        const existingType = String(
          existingIndex.data_type || existingIndex.type || existingIndex,
        ).toLowerCase();
        if (existingType !== String(index.fieldSchema).toLowerCase()) {
          throw new VectorStoreError(
            '기존 Qdrant payload index 설정이 현재 필터 계약과 다릅니다.',
            'QDRANT_COLLECTION_INCOMPATIBLE',
          );
        }
        continue;
      }
      const { payload } = await request(`${collectionPath('/index')}?wait=true`, {
        body: {
          field_name: index.fieldName,
          field_schema: index.fieldSchema,
        },
        method: 'PUT',
      });
      requireSuccessfulMutation(payload);
    }
    current = current || { config: { params: { vectors: { distance, size: vectorSize } } } };
    return { collection, created, config: current.config };
  }

  async function retrievePoints(ids) {
    if (!Array.isArray(ids)) throw new TypeError('Qdrant point ID 배열이 필요합니다.');
    if (!ids.length) return [];
    const { payload } = await request(collectionPath('/points'), {
      body: { ids, with_payload: true, with_vector: false },
      method: 'POST',
    });
    const points = payload?.result;
    if (!Array.isArray(points)) {
      throw new VectorStoreError(
        'Qdrant point 조회 응답이 올바르지 않습니다.',
        'QDRANT_INVALID_RESPONSE',
      );
    }
    return points;
  }

  async function upsertPoints(points) {
    if (!Array.isArray(points)) throw new TypeError('Qdrant point 배열이 필요합니다.');
    if (!points.length) return { skipped: true };
    const { payload } = await request(`${collectionPath('/points')}?wait=true`, {
      body: { points },
      method: 'PUT',
    });
    return requireSuccessfulMutation(payload);
  }

  async function deletePoints(ids) {
    if (!Array.isArray(ids)) throw new TypeError('삭제할 Qdrant point ID 배열이 필요합니다.');
    if (!ids.length) return { skipped: true };
    const { payload } = await request(`${collectionPath('/points/delete')}?wait=true`, {
      body: { points: ids },
      method: 'POST',
    });
    return requireSuccessfulMutation(payload);
  }

  async function scrollPoints({ offset = null, limit = 256, filter } = {}) {
    const { payload } = await request(collectionPath('/points/scroll'), {
      body: {
        limit: Math.min(1000, positiveInteger(limit, 256)),
        with_payload: true,
        with_vector: false,
        ...(offset === null || offset === undefined ? {} : { offset }),
        ...(filter ? { filter } : {}),
      },
      method: 'POST',
    });
    if (!Array.isArray(payload?.result?.points)) {
      throw new VectorStoreError(
        'Qdrant scroll 응답이 올바르지 않습니다.',
        'QDRANT_INVALID_RESPONSE',
      );
    }
    return {
      nextOffset: payload.result.next_page_offset ?? null,
      points: payload.result.points,
    };
  }

  function normalizeVector(vector) {
    if (!Array.isArray(vector) || vector.length === 0 ||
        vector.some(value => !Number.isFinite(value))) {
      throw new VectorStoreError(
        'Qdrant 검색 벡터가 올바르지 않습니다.',
        'QDRANT_INVALID_VECTOR',
      );
    }
    return vector;
  }

  function searchLimit(value) {
    if (value === undefined || value === null || value === '') return RAG_SEARCH_DEFAULTS.topK;
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > RAG_SEARCH_DEFAULTS.maxTopK) {
      throw new TypeError(`Qdrant 검색 topK는 1 이상 ${RAG_SEARCH_DEFAULTS.maxTopK} 이하여야 합니다.`);
    }
    return parsed;
  }

  function normalizeSearchPoints(points) {
    if (!Array.isArray(points)) {
      throw new VectorStoreError(
        'Qdrant 검색 응답이 올바르지 않습니다.',
        'QDRANT_INVALID_RESPONSE',
      );
    }
    return points.map(point => {
      if (point?.id === undefined || !Number.isFinite(Number(point?.score)) ||
          !point.payload || typeof point.payload !== 'object' || Array.isArray(point.payload)) {
        throw new VectorStoreError(
          'Qdrant 검색 point가 올바르지 않습니다.',
          'QDRANT_INVALID_RESPONSE',
        );
      }
      const data = point.payload;
      const contentId = data.contentId ?? data.content_id ?? null;
      return {
        id: String(point.id),
        content: String(data.content || data.overview || ''),
        metadata: {
          contentId: contentId == null ? null : String(contentId),
          contentTypeId: data.contentTypeId == null ? null : String(data.contentTypeId),
          place_name: String(data.title || data.place_name || ''),
          address: String(data.address || ''),
          open_time: String(data.openTime || data.open_time || ''),
          category: String(data.category || data.cultures?.[0] || ''),
          cultures: Array.isArray(data.cultures) ? data.cultures.map(String) : [],
          region: String(data.regionName || data.region || ''),
          tel: String(data.tel || ''),
        },
        score: Number(point.score),
      };
    });
  }

  async function searchByVector(vector, filter = {}) {
    normalizeVector(vector);
    const must = [];
    if (filter.category) must.push({ key: 'cultures', match: { value: filter.category } });
    if (filter.region) must.push({ key: 'regionName', match: { value: filter.region } });
    if (filter.contentTypeId) {
      must.push({ key: 'contentTypeId', match: { value: String(filter.contentTypeId) } });
    }
    const limit = searchLimit(filter.topK);
    const scoreThreshold = optionalScore(
      Object.prototype.hasOwnProperty.call(filter, 'scoreThreshold')
        ? filter.scoreThreshold
        : env.QDRANT_SCORE_THRESHOLD,
    );
    const body = {
      query: vector,
      limit,
      with_payload: true,
      ...(must.length ? { filter: { must } } : {}),
      ...(scoreThreshold === null ? {} : { score_threshold: scoreThreshold }),
    };
    let payload;
    try {
      ({ payload } = await request(collectionPath('/points/query'), {
        body,
        method: 'POST',
      }));
    } catch (error) {
      if (error instanceof VectorStoreError && error.status === 404) {
        throw new VectorStoreError(
          'Qdrant 검색 인덱스가 준비되지 않았습니다.',
          'QDRANT_INDEX_EMPTY',
          { status: 404 },
        );
      }
      throw error;
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload) ||
        (Object.prototype.hasOwnProperty.call(payload, 'status') &&
          String(payload.status).toLowerCase() !== 'ok')) {
      throw new VectorStoreError(
        'Qdrant 검색 응답이 올바르지 않습니다.',
        'QDRANT_INVALID_RESPONSE',
      );
    }
    const result = payload.result;
    const points = Array.isArray(result)
      ? result
      : result && typeof result === 'object' && !Array.isArray(result) &&
          Array.isArray(result.points)
        ? result.points
        : null;
    if (!points) {
      throw new VectorStoreError(
        'Qdrant 검색 응답이 올바르지 않습니다.',
        'QDRANT_INVALID_RESPONSE',
      );
    }
    return normalizeSearchPoints(points);
  }

  function embeddingDetails(result) {
    if (Array.isArray(result)) {
      return { inputTokens: 0, model: null, vector: normalizeVector(result) };
    }
    const vector = result?.vector || result?.embedding;
    if (!result || typeof result !== 'object') {
      throw new VectorStoreError(
        'Qdrant 임베딩 결과가 올바르지 않습니다.',
        'QDRANT_INVALID_VECTOR',
      );
    }
    return {
      inputTokens: Number(result.usage?.inputTokens || 0),
      model: result.model ? String(result.model) : null,
      vector: normalizeVector(vector),
    };
  }

  async function searchDetailed(query, filter = {}) {
    if (typeof embed !== 'function') {
      throw new VectorStoreError(
        'Qdrant 임베딩 설정이 완료되지 않았습니다.',
        'QDRANT_NOT_CONFIGURED',
      );
    }
    const startedAt = now();
    const embedded = embeddingDetails(await embed(query));
    const embeddedAt = now();
    const documents = await searchByVector(embedded.vector, filter);
    const completedAt = now();
    return {
      diagnostics: {
        latencyMs: {
          embedding: Math.max(0, embeddedAt - startedAt),
          qdrant: Math.max(0, completedAt - embeddedAt),
          total: Math.max(0, completedAt - startedAt),
        },
        usage: {
          embeddingModel: embedded.model,
          inputTokens: embedded.inputTokens,
        },
      },
      documents,
    };
  }

  async function search(query, filter = {}) {
    return (await searchDetailed(query, filter)).documents;
  }

  return Object.freeze({
    deletePoints,
    ensureCollection,
    getCollection,
    retrievePoints,
    scrollPoints,
    search,
    searchByVector,
    searchDetailed,
    upsertPoints,
  });
}

module.exports = { VectorStoreError, createQdrantClient };
