'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { provision, methodBody, assertMethod, assertParameters, assertStage } = require('../scripts/provisionNcpTourTest');
const { createManifest } = require('../scripts/lib/ncpGatewayManifest');
const manifest = createManifest();
const env = { NCP_GATEWAY_PRODUCT_ID: 'product1', NCP_ADMIN_ACCESS_KEY: 'example', NCP_ADMIN_SECRET_KEY: 'example' };
test('provision rejects target/hash mismatch without network', async () => {
  await assert.rejects(provision({ env, expectedProduct: 'wrong', expectedHash: manifest.hash,
    fetchImpl: () => assert.fail('network') }), { code: 'TARGET_MISMATCH' });
});
test('provision refuses existing API, even with apply', async () => {
  await assert.rejects(provision({ env, expectedProduct: 'product1', expectedHash: manifest.hash, apply: true,
    fetchImpl: async (_url, init) => { assert.equal(init.method, 'GET'); return new Response(JSON.stringify({
      total: 1, apis: [{ apiName: 'tourrelay', apiId: 'existing' }] })); } }), { code: 'EXISTING_API_REFUSED' });
});
test('preview does not perform writes', async () => {
  const r = await provision({ env, expectedProduct: 'product1', expectedHash: manifest.hash,
    fetchImpl: async (_url, init) => { assert.equal(init.method, 'GET');
      return new Response(JSON.stringify({ total: 0, apis: [] })); } });
  assert.equal(r.applied, false);
});
test('resume rejects an API with a different ownership marker before writes', async () => {
  await assert.rejects(provision({ env, expectedProduct: 'product1', expectedHash: manifest.hash,
    resumeApiId: 'existing', apply: true, fetchImpl: async (_url, init) => {
      assert.equal(init.method, 'GET');
      return new Response(JSON.stringify({ total: 1, apis: [{ apiName: 'tourrelay', apiId: 'existing', apiDescription: 'user API' }] }));
    } }), { code: 'TARGET_MISMATCH' });
});
test('rejected create is not retried and provider message is never reported', async () => {
  let posts = 0; const reports = [];
  await assert.rejects(provision({ env, expectedProduct: 'product1', expectedHash: manifest.hash, apply: true,
    report: r => reports.push(r), fetchImpl: async (_url, init) => {
      assert.equal(init.redirect, 'error');
      if (init.method === 'GET') return new Response(JSON.stringify({ total: 0, apis: [] }));
      posts++; return new Response(JSON.stringify({ error: { errorCode: '200', message: 'SECRET' } }), { status: 403 });
    } }), { code: 'HTTP_ERROR', status: 403 });
  assert.equal(posts, 1); assert.equal(JSON.stringify(reports).includes('SECRET'), false);
});
test('method and query verification reject weakened authentication or drift', () => {
  const route = manifest.routes[0];
  assertMethod(methodBody(route), route);
  assert.throws(() => assertMethod({ ...methodBody(route), requiredApiKey: { required: false } }, route));
  assertParameters({ queryStrings: route.parameters }, route);
  assert.throws(() => assertParameters({ queryStrings: route.parameters.slice(1) }, route));
});
test('stage verification refuses cache/prod/wrong upstream/rate', () => {
  const s = { stageName: 'test', endpointDomain: 'https://apis.data.go.kr', throttleRps: 2 };
  assertStage(s);
  for (const patch of [{ stageName: 'prod' }, { cacheTtlSec: 60 }, { throttleRps: 100 }, { endpointDomain: 'https://example.com' }]) {
    assert.throws(() => assertStage({ ...s, ...patch }), { code: 'STAGE_MISMATCH' });
  }
});
