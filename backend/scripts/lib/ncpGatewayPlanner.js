'use strict';
const { createHash } = require('node:crypto');
const { validId, adminError } = require('./ncpGatewayAdminClient');

function safeName(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,30}$/.test(value) ? value : '[unmanaged]';
}
function safePath(value) {
  return typeof value === 'string' && /^\/(?:[a-zA-Z0-9_-]{1,40}(?:\/[a-zA-Z0-9_-]{1,40})*)?$/.test(value)
    ? value : '[unmanaged]';
}
async function inspectGateway(client, { productId, apiId } = {}) {
  validId(productId);
  const apis = await client.listApis();
  if (apiId && !apis.some(api => api.apiId === apiId)) throw adminError('TARGET_MISMATCH');
  const inventory = [];
  for (const api of apis) {
    if (apiId && api.apiId !== apiId) continue;
    validId(api.apiId);
    const resources = await client.listResources(api.apiId);
    const stages = await client.listStages(api.apiId);
    inventory.push({ apiId: api.apiId, apiName: safeName(api.apiName),
      resources: resources.map(r => ({ resourcePath: safePath(r.resourcePath),
        methods: (Array.isArray(r.methods) ? r.methods : []).map(m =>
          ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'HEAD', 'OPTIONS', 'ANY'].includes(m.methodName) ? m.methodName : 'UNKNOWN').sort() })),
      stages: stages.map(s => ({ stageName: safeName(s.stageName),
        deployment: Number.isInteger(s.defaultDeploymentNo) ? s.defaultDeploymentNo : null })),
    });
  }
  // This inventory deliberately omits endpoint bodies/headers/keys and is NOT a restore backup.
  const snapshot = { productId, scopeApiId: apiId || null, apis: inventory,
    detailCoverage: 'resource-and-stage-inventory-only' };
  return { ...snapshot, fingerprint: createHash('sha256').update(JSON.stringify(snapshot)).digest('hex') };
}
function planGateway(manifest, inventory = null) {
  const apis = inventory?.apis.filter(a => a.apiName === manifest.apiName) || [];
  if (apis.length > 1) throw adminError('DUPLICATE_API_NAME');
  const existing = apis[0];
  const targetInspected = Boolean(inventory && (!inventory.scopeApiId || existing));
  return {
    mode: inventory ? 'read-only-diff' : 'offline-preview', manifestHash: manifest.hash,
    inventoryFingerprint: inventory?.fingerprint || null,
    readyToApply: false, deletionCount: 0,
    blockers: ['Write API schemas and ownership must be verified before implementing apply/deploy.',
      'Optional query substitution, endpoint settings, key enforcement and Stage quotas are not verified.'],
    api: existing ? 'EXISTS_REVIEW_OWNERSHIP' : (inventory && !inventory.scopeApiId ? 'CREATE_CANDIDATE' : 'UNKNOWN'),
    stage: !targetInspected ? 'UNKNOWN' : existing?.stages.some(s => s.stageName === manifest.stage)
      ? 'EXISTS_REVIEW_SETTINGS' : 'CREATE_CANDIDATE',
    routes: manifest.routes.map(route => {
      const found = existing?.resources.find(r => r.resourcePath === route.resourcePath);
      return { path: route.resourcePath, action: !targetInspected ? 'UNINSPECTED' :
        found?.methods.includes('GET') ? 'REVIEW_METHOD_AND_QUERY' : 'CREATE_CANDIDATE' };
    }),
    preserved: ['tour/test/search', 'all unrelated APIs, resources and keys'],
  };
}
module.exports = { inspectGateway, planGateway };
