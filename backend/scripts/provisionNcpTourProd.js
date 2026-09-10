'use strict';

// Creates only the prod Stage on the already-owned tourrelay API. It never
// edits API resources, test Stages, API keys, or named Usage Plans.
const fs = require('node:fs');
const { parse } = require('dotenv');
const { parseArgs } = require('node:util');
const { createHash } = require('node:crypto');
const { createManifest } = require('./lib/ncpGatewayManifest');
const { createNcpGatewayAdminClient, signRequest, validId, adminError } = require('./lib/ncpGatewayAdminClient');
const { assertMethod, assertParameters } = require('./provisionNcpTourTest');

const SETTINGS = Object.freeze({ throttleRps: 5, rateRps: 5,
  dayQuotaRequest: 800, monthQuotaRequest: 24800, quotaCondition: '2xx' });

function assertProdStage(stage) {
  if (stage?.stageName !== 'prod' || stage.endpointDomain !== 'https://apis.data.go.kr' ||
      (stage.cacheTtlSec != null && stage.cacheTtlSec !== 0) || stage.isMaintenance === true ||
      stage.throttleRps !== SETTINGS.throttleRps || stage.canaryDeploymentNo ||
      stage.useDistributionRate === true || stage.enabledContentEncoding === true) {
    throw adminError('STAGE_MISMATCH');
  }
}

function assertUsage(payload) {
  const fields = ['rateRps', 'dayQuotaRequest', 'monthQuotaRequest', 'quotaCondition'];
  if (!payload || payload.total !== 0 || payload.content.length !== 0 ||
      fields.some(field => payload[field] !== SETTINGS[field])) throw adminError('USAGE_PLAN_MISMATCH');
}

function fingerprint(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

async function provisionProd({ env, expectedProduct, expectedApiId, expectedTestStageId,
  expectedTestHash, apply = false, resumeStageId, fetchImpl = globalThis.fetch,
  report = () => {} } = {}) {
  const productId = validId(env.NCP_GATEWAY_PRODUCT_ID?.trim());
  const apiId = validId(expectedApiId);
  const testStageId = validId(expectedTestStageId);
  const prodManifest = createManifest({ services: 'tour', stage: 'prod' });
  const testManifest = createManifest({ services: 'tour', stage: 'test' });
  if (productId !== expectedProduct || testManifest.hash !== expectedTestHash) throw adminError('TARGET_MISMATCH');
  const accessKey = env.NCP_ADMIN_ACCESS_KEY?.trim();
  const secretKey = env.NCP_ADMIN_SECRET_KEY?.trim();
  const reader = createNcpGatewayAdminClient({ productId, accessKey, secretKey, fetchImpl });
  const api = (await reader.listApis()).find(item => item.apiId === apiId);
  if (!api || api.apiName !== 'tourrelay' ||
      api.apiDescription !== `CulturePath test relay ${testManifest.hash}`) throw adminError('TARGET_MISMATCH');

  const resources = await reader.listResources(apiId);
  const allowed = ['/', '/KorService2', ...prodManifest.routes.map(route => route.resourcePath)];
  if (resources.length !== allowed.length || resources.some(resource => !allowed.includes(resource.resourcePath))) {
    throw adminError('TARGET_MISMATCH');
  }
  for (const resource of resources) {
    const methods = await reader.listMethods(apiId, resource.resourceId);
    const route = prodManifest.routes.find(item => item.resourcePath === resource.resourcePath);
    if (!route) {
      if (methods.length) throw adminError('METHOD_MISMATCH');
      continue;
    }
    if (methods.length !== 1) throw adminError('METHOD_MISMATCH');
    assertMethod(methods[0], route);
    assertParameters(await reader.getParameters(apiId, resource.resourceId), route);
  }

  const stages = await reader.listStages(apiId);
  const testSummary = stages.find(stage => stage.stageId === testStageId);
  const prodSummary = stages.find(stage => stage.stageName === 'prod');
  if (!testSummary || testSummary.stageName !== 'test' || stages.some(stage => !['test', 'prod'].includes(stage.stageName)) ||
      (prodSummary && (!resumeStageId || prodSummary.stageId !== validId(resumeStageId))) ||
      (!prodSummary && resumeStageId)) throw adminError('TARGET_MISMATCH');
  const testBefore = await reader.getStage(apiId, testStageId);
  const resourceFingerprint = fingerprint(resources);
  const testFingerprint = fingerprint(testBefore);
  if (prodSummary) {
    assertProdStage(await reader.getStage(apiId, prodSummary.stageId));
    assertUsage(await reader.getStageUsagePlans(apiId, prodSummary.stageId));
  }
  report({ event: 'preflight', productId, apiId, prodManifestHash: prodManifest.hash,
    resourceFingerprint, testFingerprint, action: prodSummary ? 'verify-existing-prod' : 'create-prod', settings: SETTINGS });
  if (!apply) return { applied: false, action: prodSummary ? 'verify-existing-prod' : 'create-prod',
    prodManifestHash: prodManifest.hash, settings: SETTINGS };
  if (prodSummary) return { applied: false, alreadyConfigured: true, apiId,
    stageId: prodSummary.stageId, settings: SETTINGS };

  let writes = 0;
  async function write(method, suffix, body) {
    if (!suffix.startsWith(`/${apiId}/`)) throw adminError('WRITE_SCOPE_REFUSED');
    if (++writes > 2) throw adminError('REQUEST_BUDGET_EXCEEDED');
    const path = `/api/v1/products/${productId}/apis${suffix}`;
    const timestamp = String(Date.now());
    let response;
    try {
      response = await fetchImpl(`https://apigateway.apigw.ntruss.com${path}`, {
        method, redirect: 'error', signal: AbortSignal.timeout(15000),
        headers: { 'Content-Type': 'application/json', 'x-ncp-apigw-timestamp': timestamp,
          'x-ncp-iam-access-key': accessKey,
          'x-ncp-apigw-signature-v2': signRequest({ method, path, timestamp, accessKey, secretKey }) },
        body: JSON.stringify(body),
      });
      const raw = await response.text();
      if (!response.ok) {
        let providerCode = null;
        try { const parsed = JSON.parse(raw); const code = String(parsed.error?.errorCode ?? parsed.errorCode ?? '');
          if (/^[A-Z0-9_]{1,50}$/.test(code)) providerCode = code; } catch {}
        report({ event: 'write-rejected', method, status: response.status, providerCode, writes });
        throw adminError('HTTP_ERROR', response.status);
      }
      return raw ? JSON.parse(raw) : {};
    } catch (error) {
      if (error.code === 'HTTP_ERROR') throw error;
      throw adminError('WRITE_RESULT_UNCERTAIN');
    }
  }

  let stageId = null;
  try {
    const created = await write('POST', `/${apiId}/stages`, {
      stageName: 'prod', endpointDomain: prodManifest.endpointDomain,
      throttleRps: SETTINGS.throttleRps, isMaintenance: false,
      enabledContentEncoding: false,
      deploymentDescription: `CulturePath prod ${prodManifest.hash}`,
    });
    stageId = validId(created.stage?.stageId);
    if (created.stage.apiId !== apiId || created.stage.stageName !== 'prod') throw adminError('TARGET_MISMATCH');
    assertProdStage(await reader.getStage(apiId, stageId));
    report({ event: 'prod-stage-created', apiId, stageId });

    await write('PUT', `/${apiId}/stages/${stageId}/usage-plan`, SETTINGS);
    const stage = await reader.getStage(apiId, stageId);
    const usage = await reader.getStageUsagePlans(apiId, stageId);
    assertProdStage(stage);
    assertUsage(usage);
    const resourcesAfter = await reader.listResources(apiId);
    const testAfter = await reader.getStage(apiId, testStageId);
    if (fingerprint(resourcesAfter) !== resourceFingerprint || fingerprint(testAfter) !== testFingerprint) {
      throw adminError('PRESERVED_CONFIGURATION_DRIFT');
    }
    report({ event: 'prod-verified', apiId, stageId,
      deployment: stage.deployedStageDeploymentNo ?? null, settings: SETTINGS,
      existingConfigurationPreserved: true });
    return { applied: true, apiId, stageId, deployment: stage.deployedStageDeploymentNo ?? null,
      writes, settings: SETTINGS, liveVerified: false, railwayChanged: false };
  } catch (error) {
    report({ event: 'stopped', stageId, writes, automaticCleanup: false });
    throw error;
  }
}

async function run(argv = process.argv.slice(2)) {
  const { values } = parseArgs({ args: argv, options: {
    'env-file': { type: 'string' }, 'product-id': { type: 'string' },
    'api-id': { type: 'string' }, 'test-stage-id': { type: 'string' },
    'test-manifest-hash': { type: 'string' }, 'resume-stage-id': { type: 'string' },
    apply: { type: 'boolean', default: false },
  } });
  const env = parse(fs.readFileSync(values['env-file']));
  return provisionProd({ env, expectedProduct: values['product-id'], expectedApiId: values['api-id'],
    expectedTestStageId: values['test-stage-id'], expectedTestHash: values['test-manifest-hash'],
    resumeStageId: values['resume-stage-id'], apply: values.apply,
    report: value => console.log(JSON.stringify(value)) });
}
if (require.main === module) run().then(result => console.log(JSON.stringify(result))).catch(error => {
  const codes = ['TARGET_MISMATCH', 'WRITE_SCOPE_REFUSED', 'REQUEST_BUDGET_EXCEEDED', 'HTTP_ERROR',
    'WRITE_RESULT_UNCERTAIN', 'METHOD_MISMATCH', 'PARAMETER_MISMATCH', 'STAGE_MISMATCH',
    'USAGE_PLAN_MISMATCH', 'PRESERVED_CONFIGURATION_DRIFT', 'INVALID_ID', 'NETWORK_ERROR', 'TIMEOUT'];
  console.error(JSON.stringify({ code: codes.includes(error.code) ? error.code : 'INVALID_CONFIGURATION',
    status: error.status ?? null }));
  process.exitCode = 1;
});

module.exports = { provisionProd, assertProdStage, assertUsage, SETTINGS };
