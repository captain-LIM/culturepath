'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { AiProviderError, createOpenRouterClient } = require('../src/services/openRouterClient');

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return body; },
  };
}

test('uses OpenRouter chat and embedding contracts without exposing the key in payloads', async () => {
  const requests = [];
  const client = createOpenRouterClient({
    env: {
      OPENROUTER_API_KEY: 'secret-test-key',
      OPENROUTER_BASE_URL: 'https://openrouter.test/api/v1',
      OPENROUTER_MODEL: 'provider/chat-model',
      OPENROUTER_EMBEDDING_MODEL: 'provider/embedding-model',
      OPENROUTER_TIMEOUT_MS: '1000',
    },
    fetchImpl: async (url, options) => {
      requests.push({ url, options, body: JSON.parse(options.body) });
      if (url.endsWith('/embeddings')) {
        return jsonResponse({
          data: [{ embedding: [0.1, 0.2], index: 0 }],
          model: 'provider/embedding-model',
          usage: { prompt_tokens: 2, total_tokens: 2 },
        });
      }
      return jsonResponse({
        model: 'provider/chat-model',
        choices: [{ message: { content: '{"ok":true}' } }],
        usage: { prompt_tokens: 3, completion_tokens: 2 },
      });
    },
  });

  const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['ok'],
    properties: { ok: { type: 'boolean' } },
  };
  const generated = await client.generate('system', [{ role: 'user', content: 'hello' }], {
    jsonSchema: { name: 'test_output', schema },
  });
  const embedding = await client.embed('hello');

  assert.equal(generated.content, '{"ok":true}');
  assert.deepEqual(generated.usage, { inputTokens: 3, outputTokens: 2 });
  assert.deepEqual(embedding, [0.1, 0.2]);
  assert.deepEqual(requests[0].body.response_format, {
    type: 'json_schema',
    json_schema: { name: 'test_output', strict: true, schema },
  });
  assert.deepEqual(requests[0].body.provider, { require_parameters: true });
  assert.equal(requests[0].body.stream, false);
  assert.equal(requests[0].body.max_tokens, 1600);
  assert.equal(requests[1].body.model, 'provider/embedding-model');
  assert.equal(requests[1].body.encoding_format, 'float');
  assert.equal(JSON.stringify(requests.map(request => request.body)).includes('secret-test-key'), false);
});

test('batches embeddings, restores response index order, and validates dimensions', async () => {
  const client = createOpenRouterClient({
    env: {
      OPENROUTER_API_KEY: 'secret-test-key',
      OPENROUTER_EMBEDDING_MODEL: 'baai/bge-m3',
    },
    fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body);
      if (body.input.length === 2) {
        assert.deepEqual(body.input, ['첫째', '둘째']);
        return jsonResponse({
          data: [
            { index: 1, embedding: [0.3, 0.4] },
            { index: 0, embedding: [0.1, 0.2] },
          ],
          usage: { total_tokens: 4 },
        });
      }
      return jsonResponse({ data: [{ index: 0, embedding: [0.1, 0.2] }] });
    },
  });

  const result = await client.embedMany(['첫째', '둘째'], { expectedDimensions: 2 });
  assert.deepEqual(result.embeddings, [[0.1, 0.2], [0.3, 0.4]]);
  assert.deepEqual(result.usage, { inputTokens: 4 });
  await assert.rejects(
    client.embedMany(['첫째'], { expectedDimensions: 3 }),
    error => error instanceof AiProviderError && error.code === 'OPENROUTER_DIMENSION_MISMATCH',
  );
});

test('fails closed when OpenRouter configuration is missing', async () => {
  const client = createOpenRouterClient({ env: {}, fetchImpl: async () => jsonResponse({}) });
  await assert.rejects(
    client.generate('system', [{ role: 'user', content: 'hello' }]),
    error => error instanceof AiProviderError && error.code === 'OPENROUTER_NOT_CONFIGURED',
  );

  const invalidModelClient = createOpenRouterClient({
    env: {
      OPENROUTER_API_KEY: 'secret-test-key',
      OPENROUTER_MODEL: 'invalid-model-without-provider',
    },
    fetchImpl: async () => { throw new Error('must not call'); },
  });
  await assert.rejects(
    invalidModelClient.generate('system', [{ role: 'user', content: 'hello' }]),
    error => error instanceof AiProviderError && error.code === 'OPENROUTER_NOT_CONFIGURED',
  );
});

test('uses the approved low-cost model by default and enforces the output cap', async () => {
  let requestBody;
  const client = createOpenRouterClient({
    env: {
      OPENROUTER_API_KEY: 'secret-test-key',
      OPENROUTER_MAX_OUTPUT_TOKENS: '1200',
    },
    fetchImpl: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return jsonResponse({
        choices: [{ message: { content: 'ok' } }],
        usage: {},
      });
    },
  });
  const result = await client.generate('system', [{ role: 'user', content: 'hello' }], {
    maxTokens: 1000,
  });
  assert.equal(requestBody.model, 'google/gemini-2.5-flash-lite');
  assert.equal(requestBody.max_tokens, 1000);
  assert.equal(result.model, 'google/gemini-2.5-flash-lite');
  await assert.rejects(
    client.generate('system', [{ role: 'user', content: 'hello' }], { maxTokens: 1201 }),
    /1200 이하/,
  );
  await assert.rejects(
    client.generate('system', [{ role: 'user', content: 'hello' }], {
      jsonSchema: { name: 'Invalid-Name', schema: {} },
    }),
    /JSON Schema/,
  );
});

test('keeps the timeout active while parsing the response body', async () => {
  const client = createOpenRouterClient({
    env: {
      OPENROUTER_API_KEY: 'secret-test-key',
      OPENROUTER_MODEL: 'provider/chat-model',
      OPENROUTER_TIMEOUT_MS: '5',
    },
    fetchImpl: async (_url, options) => ({
      ok: true,
      status: 200,
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
    client.generate('system', [{ role: 'user', content: 'hello' }]),
    error => error instanceof AiProviderError && error.code === 'OPENROUTER_TIMEOUT',
  );
});
