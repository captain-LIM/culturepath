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
        return jsonResponse({ data: [{ embedding: [0.1, 0.2] }] });
      }
      return jsonResponse({
        model: 'provider/chat-model',
        choices: [{ message: { content: '{"ok":true}' } }],
        usage: { prompt_tokens: 3, completion_tokens: 2 },
      });
    },
  });

  const generated = await client.generate('system', [{ role: 'user', content: 'hello' }], { json: true });
  const embedding = await client.embed('hello');

  assert.equal(generated.content, '{"ok":true}');
  assert.deepEqual(generated.usage, { inputTokens: 3, outputTokens: 2 });
  assert.deepEqual(embedding, [0.1, 0.2]);
  assert.equal(requests[0].body.response_format.type, 'json_object');
  assert.equal(requests[1].body.model, 'provider/embedding-model');
  assert.equal(JSON.stringify(requests.map(request => request.body)).includes('secret-test-key'), false);
});

test('fails closed when OpenRouter configuration is missing', async () => {
  const client = createOpenRouterClient({ env: {}, fetchImpl: async () => jsonResponse({}) });
  await assert.rejects(
    client.generate('system', [{ role: 'user', content: 'hello' }]),
    error => error instanceof AiProviderError && error.code === 'OPENROUTER_NOT_CONFIGURED',
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
