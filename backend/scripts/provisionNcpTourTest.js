'use strict';

// Separate from the read-only CLI: new test API, or explicit ID/hash-verified
// resume. Existing matching methods are preserved; no deletes or production writes.
const fs = require('node:fs');
const { parse } = require('dotenv');
const { parseArgs } = require('node:util');
const { createHash } = require('node:crypto');
const { createManifest } = require('./lib/ncpGatewayManifest');
const { createNcpGatewayAdminClient, signRequest, validId, adminError } = require('./lib/ncpGatewayAdminClient');

function methodBody(route) {
  return { methodName: 'GET', methodDescription: 'CulturePath managed test relay',
    httpEndPoint: { method: 'GET', stream: false, url: route.endpointPath },
    requiredApiKey: { required: true }, authentication: { platform: 'NONE' },
    validation: { type: 'QUERYSTRING_HEADERS', headers: [],
      queryStrings: route.parameters.filter(p => p.isRequired).map(p => p.parameterName) } };
}
function assertMethod(actual, route) {
  const expected = methodBody(route);
  if (actual?.methodName !== 'GET' || actual.httpEndPoint?.method !== 'GET' ||
      actual.httpEndPoint?.stream !== false || actual.httpEndPoint?.url !== route.endpointPath ||
      actual.requiredApiKey?.required !== true || actual.authentication?.platform !== 'NONE' ||
      actual.validation?.type !== expected.validation.type ||
      JSON.stringify([...(actual.validation.queryStrings || [])].sort()) !==
      JSON.stringify([...expected.validation.queryStrings].sort()) ||
      (actual.validation.headers || []).length !== 0) throw adminError('METHOD_MISMATCH');
}
function assertParameters(actual, route) {
  const fields = ['parameterName', 'parameterCode', 'parameterType', 'isArray', 'isRequired'];
  const normalized = list => list.map(p => fields.map(f => p[f])).sort((a,b) => a[0].localeCompare(b[0]));
  if (!Array.isArray(actual.queryStrings) || (actual.headers || []).length || (actual.formDatas || []).length ||
      JSON.stringify(normalized(actual.queryStrings)) !== JSON.stringify(normalized(route.parameters))) {
    throw adminError('PARAMETER_MISMATCH');
  }
}
function assertStage(stage) {
  if (stage?.stageName !== 'test' || stage.endpointDomain !== 'https://apis.data.go.kr' ||
      (stage.cacheTtlSec != null && stage.cacheTtlSec !== 0) || stage.isMaintenance === true ||
      stage.throttleRps !== 2 || stage.canaryDeploymentNo || stage.useDistributionRate === true) {
    throw adminError('STAGE_MISMATCH');
  }
}

async function provision({ env, expectedProduct, expectedHash, apply = false, resumeApiId,
  fetchImpl = globalThis.fetch, report = () => {} } = {}) {
  const manifest = createManifest({ services: 'tour', stage: 'test' });
  const productId = validId(env.NCP_GATEWAY_PRODUCT_ID?.trim());
  if (productId !== expectedProduct || manifest.hash !== expectedHash) throw adminError('TARGET_MISMATCH');
  const accessKey = env.NCP_ADMIN_ACCESS_KEY?.trim();
  const secretKey = env.NCP_ADMIN_SECRET_KEY?.trim();
  const reader = createNcpGatewayAdminClient({ productId, accessKey, secretKey, fetchImpl });
  const apis = await reader.listApis();
  const existing = apis.find(a => a.apiName === 'tourrelay');
  if (existing && !resumeApiId) throw adminError('EXISTING_API_REFUSED');
  if (resumeApiId && (!existing || existing.apiId !== validId(resumeApiId) ||
      existing.apiDescription !== `CulturePath test relay ${manifest.hash}`)) throw adminError('TARGET_MISMATCH');
  const initialResources = resumeApiId ? await reader.listResources(resumeApiId) : [];
  const initialStages = resumeApiId ? await reader.listStages(resumeApiId) : [];
  if (resumeApiId) {
    const allowed = ['/', '/KorService2', ...manifest.routes.map(r => r.resourcePath)];
    if (initialResources.some(r => !allowed.includes(r.resourcePath)) ||
        initialStages.length !== 1 || initialStages[0].stageName !== 'test') throw adminError('TARGET_MISMATCH');
    assertStage(await reader.getStage(resumeApiId, initialStages[0].stageId));
    for (const r of initialResources) {
      const methods = await reader.listMethods(resumeApiId, r.resourceId);
      if (!methods.length) continue;
      const route = manifest.routes.find(route => route.resourcePath === r.resourcePath);
      if (!route || methods.length !== 1) throw adminError('METHOD_MISMATCH');
      assertMethod(methods[0], route);
      assertParameters(await reader.getParameters(resumeApiId, r.resourceId), route);
    }
  }
  // Capture complete in-memory GET responses for preserved resources; never print secrets.
  async function snapshot(apiList) {
    const rows = [];
    for (const api of apiList) {
      const resources = await reader.listResources(api.apiId);
      const stages = await reader.listStages(api.apiId);
      rows.push({ api, resources, stages, methods: await Promise.all(resources.map(async r => ({
        id: r.resourceId, methods: await reader.listMethods(api.apiId, r.resourceId),
        parameters: r.methods?.some(m => m.methodName === 'GET') ? await reader.getParameters(api.apiId, r.resourceId) : null,
      }))), stageDetails: await Promise.all(stages.map(s => reader.getStage(api.apiId, s.stageId))) });
    }
    return createHash('sha256').update(JSON.stringify(rows)).digest('hex');
  }
  const before = await snapshot(apis.filter(a => a.apiId !== resumeApiId));
  report({ event: 'preflight', productId, manifestHash: manifest.hash, preservedFingerprint: before, routes: 10 });
  if (!apply) return { applied: false, manifestHash: manifest.hash, preservedFingerprint: before };
  let createdApiId = resumeApiId;
  let writes = 0;
  async function post(suffix, body) {
    // Only initial creation or descendants of the created/explicitly verified API.
    if (suffix !== '' && (!createdApiId || !suffix.startsWith(`/${createdApiId}/`))) throw adminError('WRITE_SCOPE_REFUSED');
    if (++writes > 160) throw adminError('REQUEST_BUDGET_EXCEEDED');
    const path = `/api/v1/products/${productId}/apis${suffix}`;
    const timestamp = String(Date.now());
    let res;
    try {
      res = await fetchImpl(`https://apigateway.apigw.ntruss.com${path}`, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
        headers: { 'Content-Type': 'application/json', 'x-ncp-apigw-timestamp': timestamp,
          'x-ncp-iam-access-key': accessKey,
          'x-ncp-apigw-signature-v2': signRequest({ method: 'POST', path, timestamp, accessKey, secretKey }) },
        body: JSON.stringify(body),
      });
      const raw = await res.text();
      if (!res.ok) {
        let providerCode = null;
        try { const p = JSON.parse(raw); const c = String(p.error?.errorCode ?? p.errorCode ?? '');
          if (/^[A-Z0-9_]{1,50}$/.test(c)) providerCode = c; } catch {}
        report({ event: 'write-rejected', status: res.status, providerCode, writes });
        throw adminError('HTTP_ERROR', res.status);
      }
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      // A failed write is NEVER retried: the server may already have applied it.
      if (e.code === 'HTTP_ERROR') throw e;
      throw adminError('WRITE_RESULT_UNCERTAIN');
    }
  }
  try {
    if (!resumeApiId) {
    const result = await post('', { apiName: 'tourrelay', apiDescription: `CulturePath test relay ${manifest.hash}` });
    if (result.api?.productId !== productId || result.api?.apiName !== 'tourrelay') throw adminError('TARGET_MISMATCH');
    createdApiId = validId(result.api.apiId);
    report({ event: 'api-created', apiId: createdApiId });
    }
    if (!initialResources.some(r => r.resourcePath === '/KorService2')) {
      await post(`/${createdApiId}/resources`, { resourcePath: '/KorService2' });
    }
    for (const route of manifest.routes) {
      const prior = initialResources.find(r => r.resourcePath === route.resourcePath);
      if (prior?.methods?.length) {
        report({ event: 'existing-route-preserved', operation: route.operation });
        continue;
      }
      const result = prior ? { resource: prior } : await post(`/${createdApiId}/resources`, { resourcePath: route.resourcePath });
      const r = result.resource;
      if (!r || (!prior && r.apiId !== createdApiId) || (r.apiId && r.apiId !== createdApiId) || r.resourcePath !== route.resourcePath) throw adminError('TARGET_MISMATCH');
      const resourceId = validId(r.resourceId);
      await post(`/${createdApiId}/resources/${resourceId}/methods`, methodBody(route));
      for (const parameter of route.parameters) {
        await post(`/${createdApiId}/resources/${resourceId}/methods/GET/parameters`, parameter);
      }
      const methods = await reader.listMethods(createdApiId, resourceId);
      if (methods.length !== 1) throw adminError('METHOD_MISMATCH');
      assertMethod(methods[0], route);
      assertParameters(await reader.getParameters(createdApiId, resourceId), route);
      report({ event: 'route-verified', operation: route.operation });
    }
    // No cacheTtlSec means cache disabled; verify the response before further action.
    const resultStage = resumeApiId ? { stage: initialStages[0] } : await post(`/${createdApiId}/stages`, { stageName: 'test',
      endpointDomain: manifest.endpointDomain, throttleRps: 2, isMaintenance: false,
      enabledContentEncoding: false, deploymentDescription: `CulturePath test ${manifest.hash}` });
    const stageId = validId(resultStage.stage?.stageId);
    if (resumeApiId) await post(`/${createdApiId}/deploy`, { stageId,
      deploymentDescription: `CulturePath test ${manifest.hash}` });
    const stage = await reader.getStage(createdApiId, stageId);
    assertStage(stage);
    report({ event: 'stage-created', apiId: createdApiId, stageId,
      deployment: stage.deployedStageDeploymentNo ?? null, cacheTtlSec: stage.cacheTtlSec ?? null });
    const afterApis = (await reader.listApis()).filter(a => a.apiId !== createdApiId);
    const after = await snapshot(afterApis);
    if (before !== after) throw adminError('PRESERVED_CONFIGURATION_DRIFT');
    return { applied: true, apiId: createdApiId, stageId, writes,
      deployment: stage.deployedStageDeploymentNo ?? null, existingConfigurationPreserved: true,
      liveVerified: false, productionChanged: false };
  } catch (e) {
    report({ event: 'stopped', createdApiId: createdApiId || null, writes, automaticCleanup: false });
    throw e;
  }
}

async function run(argv = process.argv.slice(2)) {
  const { values } = parseArgs({ args: argv, options: { 'env-file': { type: 'string' },
    'product-id': { type: 'string' }, 'manifest-hash': { type: 'string' }, 'resume-api-id': { type: 'string' }, apply: { type: 'boolean', default: false } } });
  const env = parse(fs.readFileSync(values['env-file']));
  return provision({ env, expectedProduct: values['product-id'], expectedHash: values['manifest-hash'],
    apply: values.apply, resumeApiId: values['resume-api-id'], report: value => console.log(JSON.stringify(value)) });
}
if (require.main === module) run().then(r => console.log(JSON.stringify(r))).catch(e => {
  const codes = ['TARGET_MISMATCH', 'EXISTING_API_REFUSED', 'WRITE_SCOPE_REFUSED', 'REQUEST_BUDGET_EXCEEDED',
    'HTTP_ERROR', 'WRITE_RESULT_UNCERTAIN', 'METHOD_MISMATCH', 'PARAMETER_MISMATCH', 'STAGE_MISMATCH',
    'PRESERVED_CONFIGURATION_DRIFT', 'INVALID_ID', 'NETWORK_ERROR', 'TIMEOUT'];
  console.error(JSON.stringify({ code: codes.includes(e.code) ? e.code : 'INVALID_CONFIGURATION', status: e.status ?? null }));
  process.exitCode = 1;
});
module.exports = { provision, methodBody, assertMethod, assertParameters, assertStage };
