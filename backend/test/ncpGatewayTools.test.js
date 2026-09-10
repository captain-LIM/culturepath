'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { createHmac } = require('node:crypto');
const { createNcpGatewayAdminClient, signRequest } = require('../scripts/lib/ncpGatewayAdminClient');
const { createManifest } = require('../scripts/lib/ncpGatewayManifest');
const { inspectGateway, planGateway } = require('../scripts/lib/ncpGatewayPlanner');
const { run } = require('../scripts/ncpGateway');
const { run: smoke } = require('../scripts/smokeNcpTourGateway');
const { run: guardSmoke } = require('../scripts/verifyNcpTourGatewayGuards');
const credentials = { productId: 'product1', accessKey: 'fake-access', secretKey: 'fake-secret' };
const adminEnv = 'NCP_GATEWAY_PRODUCT_ID=product1\nNCP_ADMIN_ACCESS_KEY=fake-access\nNCP_ADMIN_SECRET_KEY=fake-secret';
const runtimeEnv = 'TOUR_API_KEY=fake-tour-secret\nNCP_TOUR_GATEWAY_ENABLED=true\nNCP_TOUR_GATEWAY_BASE_URL=https://product1.apigw.ntruss.com/tourrelay/test\nNCP_TOUR_GATEWAY_API_KEY=fake-gateway-secret';
function json(body, status = 200) { return { ok: status === 200, status, text: async () => JSON.stringify(body) }; }
function inventoryFetch(calls) {
  return async (url, opts) => {
    calls.push({ url, opts });
    if (url.includes('/resources')) return json({ resourceList: [{ resourcePath: '/search',
      methods: [{ methodName: 'GET' }], primaryKey: 'DO-NOT-OUTPUT', endpoint: 'DO-NOT-OUTPUT' }] });
    if (url.includes('/stages')) return json({ host: 'https://product1.apigw.ntruss.com',
      stages: [{ stageName: 'test', defaultDeploymentNo: 1, secretKey: 'DO-NOT-OUTPUT' }] });
    return json({ total: 1, apis: [{ apiId: 'api1', apiName: 'tour', productId: 'product1',
      description: 'DO-NOT-OUTPUT', primaryKey: 'DO-NOT-OUTPUT' }] });
  };
}

test('signature implements the documented method-space-path-newline-timestamp-newline-access format', () => {
  const input = { method: 'GET', path: '/api/v1/products/product1/apis?offset=0&limit=100',
    timestamp: '1700000000000', accessKey: 'fake-access', secretKey: 'fake-secret' };
  const expected = createHmac('sha256', 'fake-secret').update('GET /api/v1/products/product1/apis?offset=0&limit=100\n1700000000000\nfake-access').digest('base64');
  assert.equal(signRequest(input), expected);
  assert.notEqual(signRequest({ ...input, path: input.path + '&withStage=true' }), expected);
});

test('inspect signs exact read-only requests and strips provider secrets', async () => {
  const calls = [];
  const client = createNcpGatewayAdminClient({ ...credentials, clock: () => 1700000000000, fetchImpl: inventoryFetch(calls) });
  const result = await inspectGateway(client, { productId: 'product1' });
  assert.equal(calls.length, 3);
  for (const { url, opts } of calls) {
    const target = new URL(url);
    assert.equal(target.origin, 'https://apigateway.apigw.ntruss.com');
    assert.equal(opts.method, 'GET'); assert.equal(opts.redirect, 'error');
    assert.equal(opts.headers['x-ncp-apigw-signature-v2'], signRequest({ ...credentials,
      method: 'GET', path: target.pathname + target.search, timestamp: '1700000000000' }));
    assert.equal(opts.headers['x-ncp-apigw-api-key'], undefined);
  }
  assert.doesNotMatch(JSON.stringify(result), /DO-NOT-OUTPUT|fake-secret|fake-access/);
  assert.equal(result.detailCoverage, 'resource-and-stage-inventory-only');
});

test('management client rejects invalid IDs before sending credentials', async () => {
  for (const productId of ['../bad', 'https://evil', '', 'product?x']) {
    assert.throws(() => createNcpGatewayAdminClient({ ...credentials, productId }), e => e.code === 'INVALID_ID');
  }
  let calls = 0;
  const client = createNcpGatewayAdminClient({ ...credentials, fetchImpl: async () => { calls++; } });
  await assert.rejects(client.listResources('../bad'), e => e.code === 'INVALID_ID');
  assert.equal(calls, 0);
});

test('management errors never retain provider body, message or cause', async () => {
  for (const fetchImpl of [async () => json({ error: { message: 'DO-NOT-OUTPUT' } }, 403),
    async () => ({ ok: true, text: async () => '<secret>DO-NOT-OUTPUT</secret>' }),
    async () => { throw Object.assign(new Error('DO-NOT-OUTPUT'), { code: 'HTTP_ERROR' }); }]) {
    await assert.rejects(createNcpGatewayAdminClient({ ...credentials, fetchImpl }).listApis(), e => {
      assert.doesNotMatch(e.stack + JSON.stringify(e), /DO-NOT-OUTPUT/); assert.equal(e.cause, undefined); return true;
    });
  }
});

test('management inventory fails closed on incomplete lists and wrong target', async () => {
  for (const payload of [{ total: 2, apis: [] }, { total: 1, apis: [{ productId: 'wrong' }] }]) {
    await assert.rejects(createNcpGatewayAdminClient({ ...credentials, fetchImpl: async () => json(payload) }).listApis());
  }
  await assert.rejects(inspectGateway(createNcpGatewayAdminClient({ ...credentials, fetchImpl: inventoryFetch([]) }),
    { productId: 'product1', apiId: 'wrong' }), e => e.code === 'TARGET_MISMATCH');
});

test('manifest covers 10 Korean / 32 total GETs, shares service mapping, and keeps pagination dynamic', () => {
  const kor = createManifest();
  const all = createManifest({ services: 'tour,tourEng,tourJpn,tourChs,relatedTour,dataLab' });
  assert.equal(kor.routes.length, 10); assert.equal(all.routes.length, 32);
  assert.equal(new Set(all.routes.map(r => r.resourcePath)).size, 32);
  assert.equal(kor.hash, createManifest().hash);
  assert.notEqual(kor.hash, createManifest({ stage: 'prod' }).hash);
  for (const route of all.routes) {
    assert.equal(route.method, 'GET'); assert.equal(route.requiredApiKey, true);
    assert.match(route.endpointPath, /pageNo=\{pageNo\}&numOfRows=\{numOfRows\}/);
    assert.equal(route.parameters.find(p => p.parameterName === 'serviceKey').isRequired, true);
  }
  assert.equal(kor.cacheEnabled, false);
  assert.equal(kor.queryContract, 'UNVERIFIED_OPTIONAL_SUBSTITUTION');
});

test('read-only plan never claims existing GETs prove auth/query/Stage readiness', () => {
  const manifest = createManifest();
  const result = planGateway(manifest, { apis: [{ apiName: 'tourrelay', stages: [{ stageName: 'test' }],
    resources: [{ resourcePath: manifest.routes[0].resourcePath, methods: ['GET'] }] }] });
  assert.equal(result.readyToApply, false);
  assert.equal(result.deletionCount, 0);
  assert.equal(result.routes[0].action, 'REVIEW_METHOD_AND_QUERY');
  assert.ok(result.preserved.includes('tour/test/search'));
});

test('scoped inventory of another API never implies the relay is absent', () => {
  const plan = planGateway(createManifest(), { scopeApiId: 'api1', apis: [{ apiName: 'tour', stages: [], resources: [] }] });
  assert.equal(plan.api, 'UNKNOWN'); assert.equal(plan.stage, 'UNKNOWN');
  assert.ok(plan.routes.every(r => r.action === 'UNINSPECTED'));
});

test('manifest/offline plan do not read secrets or use network, and write commands are rejected', async () => {
  const deps = { readFile: () => { throw new Error('must not read'); }, fetchImpl: () => { throw new Error('must not fetch'); } };
  assert.equal((await run(['manifest'], deps)).routes.length, 10);
  assert.equal((await run(['plan', '--offline'], deps)).readyToApply, false);
  for (const command of ['apply', 'deploy', 'delete', 'verify']) {
    await assert.rejects(run([command], deps), e => e.code === 'READ_ONLY_COMMANDS_ONLY');
  }
  await assert.rejects(run(['inspect', '--secret', 'private'], deps), e => e.code === 'INVALID_ARGUMENTS');
});

test('CLI inspect and plan perform GET only', async () => {
  for (const command of ['inspect', 'plan']) {
    const calls = [];
    await run([command, '--env-file', 'fake.env'], { readFile: () => adminEnv, fetchImpl: inventoryFetch(calls) });
    assert.equal(calls.length, 3);
    assert.ok(calls.every(call => call.opts.method === 'GET'));
  }
});

test('smoke preview is side-effect free and prevalidates request budgets', async () => {
  const deps = { readFile: () => { throw new Error('must not read'); }, fetchImpl: () => { throw new Error('must not fetch'); } };
  assert.equal((await smoke([], deps)).requests, 0);
  await assert.rejects(smoke(['--live', '--suite', 'kor', '--max-requests', '2'], deps), e => e.code === 'INVALID_REQUEST_BUDGET');
  await assert.rejects(smoke(['--services', 'tourEng'], deps), e => e.code === 'UNSUPPORTED_SUITE');
});

test('smoke verifies two real query pages and emits no secret or raw URL', async () => {
  const calls = [];
  const result = await smoke(['--live'], { readFile: () => runtimeEnv, fetchImpl: async (url, opts) => {
    calls.push({ url, opts });
    return json({ response: { header: { resultCode: '0000', resultMsg: 'OK' }, body: {
      pageNo: Number(url.searchParams.get('pageNo')), numOfRows: 2, totalCount: 12,
      items: { item: { contentid: url.searchParams.get('pageNo') } },
    } } });
  } });
  assert.equal(result.ok, true); assert.equal(result.requests, 2);
  assert.equal(calls[1].url.searchParams.get('pageNo'), '2');
  assert.doesNotMatch(JSON.stringify(result), /fake-tour-secret|fake-gateway-secret|apigw\.ntruss/);
});

test('smoke requires explicit prod URL and existing-key opt-in for deployment diagnostics', async () => {
  const calls = [];
  const diagnosticEnv = 'TOUR_API_KEY=fake-tour-secret\nNCP_TOUR_TEST_API_KEY=fake-gateway-secret';
  const result = await smoke(['--live', '--gateway-base-url',
    'https://product1.apigw.ntruss.com/tourrelay/prod', '--use-existing-test-key'], {
    readFile: () => diagnosticEnv,
    fetchImpl: async (url, opts) => {
      calls.push({ url, opts });
      return json({ response: { header: { resultCode: '0000' }, body: {
        pageNo: Number(url.searchParams.get('pageNo')), numOfRows: 2, totalCount: 12,
        items: { item: { contentid: url.searchParams.get('pageNo') } },
      } } });
    },
  });
  assert.equal(result.ok, true); assert.equal(calls.length, 2);
  assert.ok(calls.every(call => call.url.pathname.startsWith('/tourrelay/prod/KorService2/')));
  assert.ok(calls.every(call => call.opts.headers['x-ncp-apigw-api-key'] === 'fake-gateway-secret'));
});

test('guard smoke checks only the three expected Gateway rejections', async () => {
  const statuses = [401, 404, 404];
  const calls = [];
  const result = await guardSmoke(['--live', '--gateway-base-url',
    'https://product1.apigw.ntruss.com/tourrelay/prod', '--use-existing-test-key'], {
    readFile: () => 'TOUR_API_KEY=fake-tour-secret\nNCP_TOUR_TEST_API_KEY=fake-gateway-secret',
    fetchImpl: async (url, opts) => {
      calls.push({ url, opts });
      const status = statuses[calls.length - 1];
      return { status, text: async () => JSON.stringify({ error: { errorCode: status === 401 ? '210' : '300' } }) };
    },
  });
  assert.equal(result.ok, true); assert.equal(calls.length, 3);
  assert.equal(calls[0].opts.headers['x-ncp-apigw-api-key'], undefined);
  assert.equal(calls[1].opts.method, 'POST');
  assert.ok(calls[2].url.includes('/notConfigured?'));
  assert.doesNotMatch(JSON.stringify(result), /fake-tour-secret|fake-gateway-secret/);
});

test('smoke rejects fixed test endpoint behavior and stops at the first failure', async () => {
  const result = await smoke(['--live'], { readFile: () => runtimeEnv, fetchImpl: async () => json({ response: {
    header: { resultCode: '0000' }, body: { pageNo: 1, numOfRows: 1, totalCount: 12, items: { item: { contentid: '1' } } },
  } }) });
  assert.equal(result.ok, false); assert.equal(result.requests, 1);
  assert.equal(result.error.code, 'RESPONSE_CONTRACT_FAILED');
});

test('full Korean smoke makes exactly 12 serial requests and covers all 10 operations', async () => {
  const operations = [];
  const result = await smoke(['--live', '--suite', 'kor'], { readFile: () => runtimeEnv,
    fetchImpl: async url => {
      operations.push(url.pathname.split('/').at(-1));
      const pageNo = Number(url.searchParams.get('pageNo'));
      return json({ response: { header: { resultCode: '0000' }, body: {
        pageNo, numOfRows: Number(url.searchParams.get('numOfRows')), totalCount: 12,
        items: { item: { contentid: String(pageNo), contenttypeid: '12' } },
      } } });
    } });
  assert.equal(result.ok, true); assert.equal(result.requests, 12);
  assert.equal(new Set(operations).size, 10);
});

test('smoke will not implicitly use direct credentials when Gateway is disabled', async () => {
  let calls = 0;
  await assert.rejects(smoke(['--live'], { readFile: () => 'TOUR_API_KEY=fake-tour-secret',
    fetchImpl: async () => { calls++; } }), e => e.code === 'GATEWAY_NOT_ENABLED');
  assert.equal(calls, 0);
});

test('management body timeout is bounded and sanitized', async () => {
  const client = createNcpGatewayAdminClient({ ...credentials, timeoutMs: 5,
    fetchImpl: async (_url, { signal }) => ({ ok: true, text: () => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('DO-NOT-OUTPUT')), { once: true });
    }) }) });
  await assert.rejects(client.listApis(), e => e.code === 'TIMEOUT' && !e.message.includes('DO-NOT-OUTPUT'));
});
