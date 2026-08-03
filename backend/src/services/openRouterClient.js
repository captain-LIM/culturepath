'use strict';

const { DEFAULTS: RAG_INDEX_DEFAULTS } = require('../config/ragIndex');

class AiProviderError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'AiProviderError';
    this.status = options.status || null;
    this.code = options.code || 'AI_PROVIDER_ERROR';
  }
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function createOpenRouterClient(options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const baseUrl = String(env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1')
    .replace(/\/+$/, '');
  const timeoutMs = positiveInteger(env.OPENROUTER_TIMEOUT_MS, 15000);

  async function post(path, body) {
    if (!env.OPENROUTER_API_KEY) {
      throw new AiProviderError('OpenRouter가 설정되지 않았습니다.', {
        code: 'OPENROUTER_NOT_CONFIGURED',
      });
    }
    if (typeof fetchImpl !== 'function') {
      throw new AiProviderError('OpenRouter HTTP 클라이언트를 사용할 수 없습니다.');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    let payload;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          ...(env.OPENROUTER_SITE_URL ? { 'HTTP-Referer': env.OPENROUTER_SITE_URL } : {}),
          ...(env.OPENROUTER_APP_NAME ? { 'X-Title': env.OPENROUTER_APP_NAME } : {}),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      try {
        payload = await response.json();
      } catch (error) {
        if (controller.signal.aborted || error?.name === 'AbortError') throw error;
        throw new AiProviderError('OpenRouter가 올바른 JSON을 반환하지 않았습니다.', {
          status: response.status,
          code: 'OPENROUTER_INVALID_RESPONSE',
        });
      }
    } catch (error) {
      if (controller.signal.aborted || error?.name === 'AbortError') {
        throw new AiProviderError('OpenRouter 응답 시간이 초과되었습니다.', {
          code: 'OPENROUTER_TIMEOUT',
        });
      }
      if (error instanceof AiProviderError) throw error;
      throw new AiProviderError('OpenRouter에 연결할 수 없습니다.', {
        code: 'OPENROUTER_UNAVAILABLE',
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new AiProviderError('OpenRouter 요청이 실패했습니다.', {
        status: response.status,
        code: 'OPENROUTER_REQUEST_FAILED',
      });
    }
    return payload;
  }

  async function generate(systemPrompt, messages, requestOptions = {}) {
    const model = env.OPENROUTER_MODEL;
    if (!model) {
      throw new AiProviderError('OPENROUTER_MODEL이 설정되지 않았습니다.', {
        code: 'OPENROUTER_NOT_CONFIGURED',
      });
    }
    const payload = await post('/chat/completions', {
      model,
      max_tokens: positiveInteger(requestOptions.maxTokens, 1024),
      temperature: requestOptions.temperature ?? 0.2,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.map(message => ({ role: message.role, content: message.content })),
      ],
      ...(requestOptions.json ? { response_format: { type: 'json_object' } } : {}),
    });
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      throw new AiProviderError('OpenRouter 응답에 본문이 없습니다.', {
        code: 'OPENROUTER_INVALID_RESPONSE',
      });
    }
    return {
      content,
      model: payload.model || model,
      usage: {
        inputTokens: Number(payload.usage?.prompt_tokens || 0),
        outputTokens: Number(payload.usage?.completion_tokens || 0),
      },
    };
  }

  async function embedMany(inputs, requestOptions = {}) {
    if (!Array.isArray(inputs) || inputs.length === 0 ||
        inputs.some(input => typeof input !== 'string' || !input.trim())) {
      throw new TypeError('OpenRouter batch 임베딩 입력은 비어 있지 않은 문자열 배열이어야 합니다.');
    }
    const model = String(
      env.OPENROUTER_EMBEDDING_MODEL || RAG_INDEX_DEFAULTS.embeddingModel,
    ).trim();
    const payload = await post('/embeddings', {
      model,
      input: inputs,
      encoding_format: 'float',
    });
    if (!Array.isArray(payload?.data) || payload.data.length !== inputs.length) {
      throw new AiProviderError('OpenRouter 임베딩 응답 개수가 올바르지 않습니다.', {
        code: 'OPENROUTER_INVALID_RESPONSE',
      });
    }

    const embeddings = new Array(inputs.length);
    for (let position = 0; position < payload.data.length; position += 1) {
      const item = payload.data[position];
      const index = Number.isSafeInteger(item?.index) ? item.index : position;
      const embedding = item?.embedding;
      if (index < 0 || index >= inputs.length || embeddings[index] ||
          !Array.isArray(embedding) || embedding.length === 0 ||
          embedding.some(value => !Number.isFinite(value))) {
        throw new AiProviderError('OpenRouter 임베딩 응답이 올바르지 않습니다.', {
          code: 'OPENROUTER_INVALID_RESPONSE',
        });
      }
      if (requestOptions.expectedDimensions &&
          embedding.length !== requestOptions.expectedDimensions) {
        throw new AiProviderError('OpenRouter 임베딩 벡터 차원이 올바르지 않습니다.', {
          code: 'OPENROUTER_DIMENSION_MISMATCH',
        });
      }
      embeddings[index] = embedding;
    }
    if (embeddings.includes(undefined)) {
      throw new AiProviderError('OpenRouter 임베딩 응답 순서가 올바르지 않습니다.', {
        code: 'OPENROUTER_INVALID_RESPONSE',
      });
    }
    return {
      embeddings,
      model: payload.model || model,
      usage: {
        inputTokens: Number(payload.usage?.prompt_tokens || payload.usage?.total_tokens || 0),
      },
    };
  }

  async function embed(input, requestOptions = {}) {
    const result = await embedMany([input], requestOptions);
    return result.embeddings[0];
  }

  return Object.freeze({ embed, embedMany, generate });
}

module.exports = { AiProviderError, createOpenRouterClient };
