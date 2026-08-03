'use strict';

const { DEFAULTS: RAG_INDEX_DEFAULTS } = require('../config/ragIndex');

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

  async function search(query, filter = {}) {
    if (typeof embed !== 'function') {
      throw new VectorStoreError(
        'Qdrant 임베딩 설정이 완료되지 않았습니다.',
        'QDRANT_NOT_CONFIGURED',
      );
    }
    const vector = await embed(query);
    const must = [];
    if (filter.category) must.push({ key: 'cultures', match: { value: filter.category } });
    if (filter.region) must.push({ key: 'regionName', match: { value: filter.region } });
    const limit = Math.min(20, positiveInteger(filter.topK, 5));
    const scoreThreshold = Number.parseFloat(env.QDRANT_SCORE_THRESHOLD);
    const body = {
      query: vector,
      limit,
      with_payload: true,
      ...(must.length ? { filter: { must } } : {}),
      ...(Number.isFinite(scoreThreshold) ? { score_threshold: scoreThreshold } : {}),
    };
    const { payload } = await request(collectionPath('/points/query'), {
      body,
      method: 'POST',
    });
    const points = payload?.result?.points || payload?.result || [];
    if (!Array.isArray(points)) {
      throw new VectorStoreError(
        'Qdrant 검색 응답이 올바르지 않습니다.',
        'QDRANT_INVALID_RESPONSE',
      );
    }

    return points.map(point => {
      const data = point.payload || {};
      const contentId = data.contentId ?? data.content_id ?? null;
      return {
        id: String(point.id),
        content: String(data.content || data.overview || ''),
        metadata: {
          contentId: contentId == null ? null : String(contentId),
          place_name: String(data.title || data.place_name || ''),
          address: String(data.address || ''),
          open_time: String(data.openTime || data.open_time || ''),
          category: String(data.category || data.cultures?.[0] || ''),
          region: String(data.regionName || data.region || ''),
          tel: String(data.tel || ''),
        },
        score: Number(point.score || 0),
      };
    });
  }

  return Object.freeze({
    deletePoints,
    ensureCollection,
    getCollection,
    retrievePoints,
    scrollPoints,
    search,
    upsertPoints,
  });
}

module.exports = { VectorStoreError, createQdrantClient };
