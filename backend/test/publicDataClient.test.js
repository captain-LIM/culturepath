'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  createPublicDataClient,
  normalizeServiceKey,
} = require('../src/services/publicDataClient');

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(payload),
  };
}

function successPayload(items = '') {
  return {
    response: {
      header: { resultCode: '0000', resultMsg: 'OK' },
      body: { items, pageNo: 1, numOfRows: 10, totalCount: 0 },
    },
  };
}

test('normalizes an encoded service key exactly once', () => {
  assert.equal(normalizeServiceKey('abc%2Bdef%2Fghi%3D'), 'abc+def/ghi=');
  assert.equal(normalizeServiceKey('abc+def/ghi='), 'abc+def/ghi=');
});

test('adds common parameters without double-encoding the key or Korean input', async () => {
  let capturedUrl;
  const client = createPublicDataClient({
    serviceName: 'tour',
    baseUrl: 'https://example.test/KorService2',
    apiKey: 'abc%2Bdef%2Fghi%3D',
    maxRetries: 0,
    fetchImpl: async url => {
      capturedUrl = new URL(url);
      return jsonResponse(
        successPayload({ item: { code: '1', name: '서울' } }),
      );
    },
  });

  const result = await client.get('searchKeyword2', {
    params: { keyword: '박경리 기념관' },
    pageNo: 2,
    numOfRows: 30,
  });

  assert.equal(capturedUrl.searchParams.get('serviceKey'), 'abc+def/ghi=');
  assert.equal(capturedUrl.searchParams.get('keyword'), '박경리 기념관');
  assert.equal(capturedUrl.searchParams.get('MobileOS'), 'ETC');
  assert.equal(capturedUrl.searchParams.get('MobileApp'), 'CulturePath');
  assert.equal(capturedUrl.searchParams.get('_type'), 'json');
  assert.equal(capturedUrl.searchParams.get('pageNo'), '2');
  assert.equal(capturedUrl.searchParams.get('numOfRows'), '30');
  assert.doesNotMatch(capturedUrl.toString(), /%252B|%252F|%253D/);
  assert.equal(result.items[0].name, '서울');
});

test('retries one transient HTTP error and logs no secret or URL', async () => {
  const logs = [];
  let callCount = 0;
  const fakeKey = 'private-key-for-test';
  const client = createPublicDataClient({
    serviceName: 'dataLab',
    baseUrl: 'https://example.test/DataLabService',
    apiKey: fakeKey,
    maxRetries: 1,
    retryDelayMs: 0,
    logger: { warn: (...args) => logs.push(args) },
    fetchImpl: async () => {
      callCount += 1;
      return callCount === 1
        ? jsonResponse({}, 503)
        : jsonResponse(successPayload());
    },
  });

  await client.get('metcoRegnVisitrDDList');

  assert.equal(callCount, 2);
  assert.equal(logs.length, 1);
  const serializedLogs = JSON.stringify(logs);
  assert.doesNotMatch(serializedLogs, new RegExp(fakeKey));
  assert.doesNotMatch(serializedLogs, /example\.test/);
});

test('caps transient retries at one even if configuration is larger', async () => {
  let callCount = 0;
  const client = createPublicDataClient({
    serviceName: 'dataLab',
    baseUrl: 'https://example.test/DataLabService',
    apiKey: 'fake-key',
    maxRetries: 99,
    retryDelayMs: 0,
    logger: { warn: () => {} },
    fetchImpl: async () => {
      callCount += 1;
      return jsonResponse({}, 503);
    },
  });

  await assert.rejects(
    client.get('metcoRegnVisitrDDList'),
    error => error.code === 'HTTP_ERROR' && error.status === 503,
  );
  assert.equal(callCount, 2);
});

test('covers network, rate-limit, and non-retryable HTTP boundaries', async t => {
  await t.test('network failure retries once', async () => {
    let callCount = 0;
    const client = createPublicDataClient({
      serviceName: 'tour',
      baseUrl: 'https://example.test/KorService2',
      apiKey: 'fake-key',
      maxRetries: 1,
      retryDelayMs: 0,
      logger: { warn: () => {} },
      fetchImpl: async () => {
        callCount += 1;
        throw new Error('socket unavailable');
      },
    });

    await assert.rejects(
      client.get('areaCode2'),
      error => error.code === 'NETWORK_ERROR' && error.retryable === true,
    );
    assert.equal(callCount, 2);
  });

  await t.test('HTTP 429 retries once and can recover', async () => {
    let callCount = 0;
    const client = createPublicDataClient({
      serviceName: 'tour',
      baseUrl: 'https://example.test/KorService2',
      apiKey: 'fake-key',
      maxRetries: 1,
      retryDelayMs: 0,
      logger: { warn: () => {} },
      fetchImpl: async () => {
        callCount += 1;
        return callCount === 1
          ? jsonResponse({}, 429)
          : jsonResponse(successPayload());
      },
    });

    await client.get('areaCode2');
    assert.equal(callCount, 2);
  });

  await t.test('ordinary HTTP 4xx does not retry', async () => {
    let callCount = 0;
    const client = createPublicDataClient({
      serviceName: 'tour',
      baseUrl: 'https://example.test/KorService2',
      apiKey: 'fake-key',
      maxRetries: 1,
      retryDelayMs: 0,
      fetchImpl: async () => {
        callCount += 1;
        return jsonResponse({}, 400);
      },
    });

    await assert.rejects(
      client.get('areaCode2'),
      error =>
        error.code === 'HTTP_ERROR' &&
        error.status === 400 &&
        error.retryable === false,
    );
    assert.equal(callCount, 1);
  });
});

test('does not retry business errors or invalid JSON', async t => {
  await t.test('business error', async () => {
    let callCount = 0;
    const client = createPublicDataClient({
      serviceName: 'tour',
      baseUrl: 'https://example.test/KorService2',
      apiKey: 'fake-key',
      maxRetries: 1,
      fetchImpl: async () => {
        callCount += 1;
        return jsonResponse({
          response: {
            header: { resultCode: '11', resultMsg: '필수 파라미터 누락' },
            body: {},
          },
        });
      },
    });

    await assert.rejects(
      client.get('searchKeyword2'),
      error => error.code === 'BUSINESS_ERROR' && error.retryable === false,
    );
    assert.equal(callCount, 1);
  });

  await t.test('invalid JSON', async () => {
    let callCount = 0;
    const client = createPublicDataClient({
      serviceName: 'tour',
      baseUrl: 'https://example.test/KorService2',
      apiKey: 'fake-key',
      maxRetries: 1,
      fetchImpl: async () => {
        callCount += 1;
        return { ok: true, status: 200, text: async () => '<xml />' };
      },
    });

    await assert.rejects(
      client.get('areaCode2'),
      error => error.code === 'INVALID_RESPONSE' && error.retryable === false,
    );
    assert.equal(callCount, 1);
  });
});

test('aborts timed-out requests and retries at most once', async () => {
  let callCount = 0;
  const client = createPublicDataClient({
    serviceName: 'tour',
    baseUrl: 'https://example.test/KorService2',
    apiKey: 'fake-key',
    timeoutMs: 5,
    maxRetries: 1,
    retryDelayMs: 0,
    logger: { warn: () => {} },
    fetchImpl: async (_url, { signal }) => {
      callCount += 1;
      return new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        });
      });
    },
  });

  await assert.rejects(
    client.get('areaCode2'),
    error => error.code === 'TIMEOUT' && error.retryable === true,
  );
  assert.equal(callCount, 2);
});

test('rejects invalid operations and pagination before making a request', async () => {
  let callCount = 0;
  const client = createPublicDataClient({
    serviceName: 'tour',
    baseUrl: 'https://example.test/KorService2',
    apiKey: 'fake-key',
    fetchImpl: async () => {
      callCount += 1;
      return jsonResponse(successPayload());
    },
  });

  await assert.rejects(
    client.get('../unsafe'),
    error => error.code === 'VALIDATION_ERROR',
  );
  await assert.rejects(
    client.get('areaCode2', { pageNo: 0 }),
    error => error.code === 'VALIDATION_ERROR',
  );
  assert.equal(callCount, 0);
});
