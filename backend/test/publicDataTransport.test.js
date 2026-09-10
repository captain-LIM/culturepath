'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { getExternalApiConfig } = require('../src/config/externalApis');
const { getPublicDataTransportConfig, validateGatewayBaseUrl, validateConfiguredTransports } = require('../src/config/publicDataTransport');
const { createConfiguredPublicDataClient, createPublicDataClient } = require('../src/services/publicDataClient');
const { publicDataErrorContext } = require('../src/utils/externalApiError');
const { SERVICES, OPERATIONS } = require('../src/config/publicDataRoutes');
const base = 'https://abc123.apigw.ntruss.com/tourrelay/test';
const env = { TOUR_API_KEY: 'private+key/value=', NCP_TOUR_GATEWAY_ENABLED: 'true',
  NCP_TOUR_GATEWAY_BASE_URL: base, NCP_TOUR_GATEWAY_API_KEY: 'gateway-test-secret', NCP_TOUR_GATEWAY_SERVICES: 'tour' };
function success() { return { response: { header: { resultCode: '0000', resultMsg: 'OK' },
  body: { items: { item: { title: '경복궁' } }, pageNo: 2, numOfRows: 2, totalCount: 12 } } }; }
function response(payload = success(), status = 200) {
  return { ok: status === 200, status, text: async () => JSON.stringify(payload) };
}

test('transport disabled is backwards compatible and ignores dormant credentials', () => {
  assert.deepEqual(getPublicDataTransportConfig({}), { enabled: false });
  assert.deepEqual(getPublicDataTransportConfig({ ...env, NCP_TOUR_GATEWAY_ENABLED: 'false', NCP_TOUR_GATEWAY_BASE_URL: 'invalid' }), { enabled: false });
});

test('rejects missing secrets, unknown/duplicate services and invalid boolean without echoing values', () => {
  for (const overrides of [
    { NCP_TOUR_GATEWAY_API_KEY: '' }, { NCP_TOUR_GATEWAY_API_KEY: 'secret\r\nheader' },
    { NCP_TOUR_GATEWAY_BASE_URL: '' }, { NCP_TOUR_GATEWAY_SERVICES: 'tour,typo' },
    { NCP_TOUR_GATEWAY_SERVICES: 'tour,' }, { NCP_TOUR_GATEWAY_SERVICES: 'tour,tour' },
    { NCP_TOUR_GATEWAY_ENABLED: 'maybe-private' },
  ]) assert.throws(() => getPublicDataTransportConfig({ ...env, ...overrides }), e => {
    assert.equal(e.code, 'CONFIG_ERROR');
    assert.doesNotMatch(e.message, /gateway-test-secret|maybe-private|secret\r/);
    return true;
  });
});

test('rejects URL normalization tricks, management host and arbitrary destinations', () => {
  for (const url of [base.replace('https:', 'http:'), base.replace('abc123', 'apigateway'),
    `${base}/search`, `${base}?serviceKey=secret`, `${base}#x`, base.replace('abc123.', 'abc123.evil.'),
    base.replace('https://', 'https://secret@'), base.replace('.com/', '.com:8443/'),
    base.replace('/test', '/x/../test'), base.replace('/test', '/%2e/test'),
    base.replace('/tourrelay/', '/tour/'), base.replace('/test', '/test\\'),
    'https://evil.test/tourrelay/test', '//abc123.apigw.ntruss.com/tourrelay/test']) {
    assert.throws(() => validateGatewayBaseUrl(url), e => e.code === 'CONFIG_ERROR');
  }
  assert.equal(validateGatewayBaseUrl(`${base}/`), base);
});

test('all six transports preserve service-specific URLs and supported operations', async () => {
  const config = getExternalApiConfig({ ...env, NCP_TOUR_GATEWAY_SERVICES: Object.keys(SERVICES).join(',') });
  validateConfiguredTransports(config);
  for (const [name, segment] of Object.entries(SERVICES)) {
    let captured;
    const client = createConfiguredPublicDataClient(name, { config, fetchImpl: async (url, options) => {
      captured = { url, options }; return response();
    } });
    await client.get(OPERATIONS[name][0]);
    assert.equal(captured.url.origin, 'https://abc123.apigw.ntruss.com');
    assert.equal(captured.url.pathname, `/tourrelay/test/${segment}/${OPERATIONS[name][0]}`);
    assert.equal(captured.options.headers['x-ncp-apigw-api-key'], env.NCP_TOUR_GATEWAY_API_KEY);
    assert.equal(captured.options.redirect, 'error');
    await assert.rejects(client.get('unsupported'), e => e.code === 'VALIDATION_ERROR');
    await assert.rejects(client.get('../detailCommon2'), e => e.code === 'VALIDATION_ERROR');
  }
});

test('gateway preserves query encoding, pagination, optional omission and region strings', async () => {
  let captured;
  const config = getExternalApiConfig({ ...env, TOUR_API_KEY: 'private%2Bkey%2Fvalue%3D' });
  const client = createConfiguredPublicDataClient('tour', { config, fetchImpl: async url => { captured = url; return response(); } });
  const result = await client.get('searchKeyword2', { params: { keyword: '경복궁 (궁) + & %',
    lDongSignguCd: '010', lclsSystm2: undefined, unused: null, empty: '' }, pageNo: 2, numOfRows: 1000 });
  assert.equal(captured.searchParams.get('serviceKey'), env.TOUR_API_KEY);
  assert.equal(captured.searchParams.get('keyword'), '경복궁 (궁) + & %');
  assert.equal(captured.searchParams.get('lDongSignguCd'), '010');
  assert.equal(captured.searchParams.get('pageNo'), '2');
  assert.equal(captured.searchParams.get('numOfRows'), '1000');
  for (const name of ['lclsSystm2', 'unused', 'empty']) assert.equal(captured.searchParams.has(name), false);
  assert.equal(result.items[0].title, '경복궁');
});

test('unselected services remain direct, do not receive Gateway key, and retain key fallback', async () => {
  let captured;
  const config = getExternalApiConfig({ ...env, TOUR_API_ENG_KEY: 'english-key' });
  const client = createConfiguredPublicDataClient('tourEng', { config, fetchImpl: async (url, options) => {
    captured = { url, options }; return response();
  } });
  await client.get('searchKeyword2');
  assert.equal(captured.url.origin, 'https://apis.data.go.kr');
  assert.equal(captured.url.searchParams.get('serviceKey'), 'english-key');
  assert.equal(captured.options.headers['x-ncp-apigw-api-key'], undefined);
  config.services.tourEng.apiKey = '';
  await createConfiguredPublicDataClient('tourEng', { config, fetchImpl: async url => {
    assert.equal(url.searchParams.get('serviceKey'), env.TOUR_API_KEY); return response();
  } }).get('searchKeyword2');
});

test('startup rejects selected upstream overrides but permits unrelated disabled settings', () => {
  assert.throws(() => validateConfiguredTransports(getExternalApiConfig({ ...env, TOUR_API_BASE_URL: 'https://another.test/KorService2' })), e => e.code === 'CONFIG_ERROR');
  validateConfiguredTransports(getExternalApiConfig({ ...env, NCP_TOUR_GATEWAY_ENABLED: 'false', TOUR_API_BASE_URL: 'custom' }));
});

test('Gateway auth/quota are non-retryable; throttling/5xx retain at most one retry', async () => {
  for (const [status, code, callsExpected] of [[401, '200', 1], [403, '230', 1], [404, '300', 1],
    [429, '400', 1], [429, '410', 2], [503, '500', 2], [504, '510', 2]]) {
    let calls = 0; const logs = [];
    const config = getExternalApiConfig({ ...env, EXTERNAL_API_MAX_RETRIES: '99', EXTERNAL_API_RETRY_DELAY_MS: '0' });
    const client = createConfiguredPublicDataClient('tour', { config, logger: { warn: (...a) => logs.push(a) },
      fetchImpl: async () => { calls++; return response({ error: { errorCode: code, message: env.NCP_TOUR_GATEWAY_API_KEY } }, status); } });
    await assert.rejects(client.get('searchKeyword2'), e => {
      assert.equal(e.transport, 'ncp-gateway'); assert.equal(e.gatewayErrorCode, code);
      assert.equal(e.errorLayer, 'gateway'); return true;
    });
    assert.equal(calls, callsExpected);
    assert.doesNotMatch(JSON.stringify(logs), /gateway-test-secret|private\+key|apigw\.ntruss/);
  }
});

test('business errors and malformed JSON never retain provider secrets in exception message/cause', async () => {
  for (const body of ['<html>gateway-test-secret</html>', JSON.stringify({ response: {
    header: { resultCode: '30', resultMsg: 'gateway-test-secret' } } })]) {
    const client = createConfiguredPublicDataClient('tour', { config: getExternalApiConfig(env),
      fetchImpl: async () => ({ ok: true, status: 200, text: async () => body }) });
    await assert.rejects(client.get('searchKeyword2'), e => {
      assert.doesNotMatch(e.stack + JSON.stringify(e), /gateway-test-secret/);
      assert.equal(e.cause, undefined); return true;
    });
  }
});

test('body timeout is classified and sanitized, with no automatic direct fallback', async () => {
  const client = createPublicDataClient({ serviceName: 'tour', baseUrl: 'https://apis.data.go.kr/B551011/KorService2',
    apiKey: 'fake', gateway: getPublicDataTransportConfig(env), timeoutMs: 5, maxRetries: 0,
    fetchImpl: async (_url, { signal }) => ({ ok: true, status: 200, text: () => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('private provider message')), { once: true });
    }) }) });
  await assert.rejects(client.get('searchKeyword2'), e => {
    assert.equal(e.code, 'TIMEOUT'); assert.equal(e.transport, 'ncp-gateway');
    assert.doesNotMatch(JSON.stringify(publicDataErrorContext(e)), /private provider/); return true;
  });
});

test('safe log helper excludes attacker-controlled metadata', () => {
  const safe = publicDataErrorContext({ service: 'secret', operation: 'secret', code: 'secret',
    resultCode: 'secret', gatewayErrorCode: 'secret', status: 'secret', message: 'secret', cause: 'secret' });
  assert.deepEqual(safe, { errorName: 'Error' });
});
