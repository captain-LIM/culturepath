'use strict';

class VectorStoreError extends Error {
  constructor(message, code = 'VECTOR_STORE_ERROR') {
    super(message);
    this.name = 'VectorStoreError';
    this.code = code;
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
  const collection = String(env.QDRANT_COLLECTION || '').trim();
  const timeoutMs = positiveInteger(env.QDRANT_TIMEOUT_MS, 8000);

  async function search(query, filter = {}) {
    if (!baseUrl || !collection || typeof embed !== 'function') {
      throw new VectorStoreError(
        'Qdrant 또는 임베딩 설정이 완료되지 않았습니다.',
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

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    let payload;
    try {
      response = await fetchImpl(
        `${baseUrl}/collections/${encodeURIComponent(collection)}/points/query`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(env.QDRANT_API_KEY ? { 'api-key': env.QDRANT_API_KEY } : {}),
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        },
      );
      try {
        payload = await response.json();
      } catch (error) {
        if (controller.signal.aborted || error?.name === 'AbortError') throw error;
        throw new VectorStoreError(
          'Qdrant 검색 응답이 올바르지 않습니다.',
          'QDRANT_INVALID_RESPONSE',
        );
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

    if (!response.ok) {
      throw new VectorStoreError('Qdrant 검색 요청이 실패했습니다.', 'QDRANT_REQUEST_FAILED');
    }
    const points = payload?.result?.points || payload?.result || [];
    if (!Array.isArray(points)) {
      throw new VectorStoreError('Qdrant 검색 응답이 올바르지 않습니다.', 'QDRANT_INVALID_RESPONSE');
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

  return Object.freeze({ search });
}

module.exports = { VectorStoreError, createQdrantClient };
