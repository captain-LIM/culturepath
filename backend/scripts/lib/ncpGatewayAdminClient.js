'use strict';

const { createHmac } = require('node:crypto');
const ORIGIN = 'https://apigateway.apigw.ntruss.com';
class NcpManagementError extends Error {}
function adminError(code, status = null) {
  return Object.assign(new NcpManagementError(`NCP management: ${code}`), { code, status });
}
function validId(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9]{1,10}$/.test(value)) throw adminError('INVALID_ID');
  return value;
}
function signRequest({ method, path, timestamp, accessKey, secretKey }) {
  return createHmac('sha256', secretKey).update(`${method} ${path}\n${timestamp}\n${accessKey}`, 'utf8').digest('base64');
}

// Intentionally read-only until a live inspect confirms the write schemas and scope.
function createNcpGatewayAdminClient({ accessKey, secretKey, productId,
  fetchImpl = globalThis.fetch, clock = Date.now, timeoutMs = 10000 } = {}) {
  validId(productId);
  if (![accessKey, secretKey].every(v => typeof v === 'string' && /^[\x21-\x7e]{1,512}$/.test(v))) {
    throw adminError('MISSING_OR_INVALID_CREDENTIALS');
  }
  async function get(suffix) {
    const path = `/api/v1/products/${productId}/apis${suffix}`;
    const timestamp = String(clock());
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(`${ORIGIN}${path}`, { method: 'GET', redirect: 'error',
        signal: controller.signal, headers: {
          'x-ncp-apigw-timestamp': timestamp, 'x-ncp-iam-access-key': accessKey,
          'x-ncp-apigw-signature-v2': signRequest({ method: 'GET', path, timestamp, accessKey, secretKey }),
          Accept: 'application/json',
        } });
      if (!res.ok) throw adminError('HTTP_ERROR', res.status);
      let payload;
      try { payload = JSON.parse(await res.text()); } catch {
        throw adminError(controller.signal.aborted ? 'TIMEOUT' : 'INVALID_RESPONSE');
      }
      if (!payload || typeof payload !== 'object' || payload.error) throw adminError('INVALID_RESPONSE');
      return payload;
    } catch (error) {
      if (error instanceof NcpManagementError) throw error;
      throw adminError(controller.signal.aborted ? 'TIMEOUT' : 'NETWORK_ERROR');
    } finally { clearTimeout(timer); }
  }
  return Object.freeze({
    async listApis() {
      // Bound pagination: NCP currently permits 20 APIs/Product; fail closed if this changes.
      const payload = await get('?offset=0&limit=100&withStage=true');
      if (!Array.isArray(payload.apis) || !Number.isInteger(payload.total) ||
          payload.total !== payload.apis.length || payload.apis.length > 100) throw adminError('INCOMPLETE_API_LIST');
      if (payload.apis.some(api => api.productId && api.productId !== productId)) throw adminError('TARGET_MISMATCH');
      return payload.apis;
    },
    async listResources(apiId) {
      const payload = await get(`/${validId(apiId)}/resources`);
      if (!Array.isArray(payload.resourceList) || payload.resourceList.length > 300) throw adminError('INVALID_RESOURCE_LIST');
      return payload.resourceList;
    },
    async listStages(apiId) {
      const payload = await get(`/${validId(apiId)}/stages`);
      if (!Array.isArray(payload.stages) || payload.stages.length > 10) throw adminError('INVALID_STAGE_LIST');
      if (payload.host && payload.host !== `https://${productId}.apigw.ntruss.com`) throw adminError('TARGET_MISMATCH');
      return payload.stages;
    },
    async getStage(apiId, stageId) {
      const payload = await get(`/${validId(apiId)}/stages/${validId(stageId)}`);
      if (!payload.stage) throw adminError('INVALID_RESPONSE');
      return payload.stage;
    },
    async getStageUsagePlans(apiId, stageId) {
      const payload = await get(`/${validId(apiId)}/stages/${validId(stageId)}/usage-plans`);
      if (!Number.isInteger(payload.total) || !Array.isArray(payload.content) ||
          payload.total !== payload.content.length) throw adminError('INVALID_RESPONSE');
      return payload;
    },
    async listMethods(apiId, resourceId) {
      const payload = await get(`/${validId(apiId)}/resources/${validId(resourceId)}/methods`);
      if (!Array.isArray(payload.methods)) throw adminError('INVALID_RESPONSE');
      return payload.methods;
    },
    async getParameters(apiId, resourceId) {
      return get(`/${validId(apiId)}/resources/${validId(resourceId)}/methods/GET/parameters`);
    },
  });
}

module.exports = { createNcpGatewayAdminClient, signRequest, validId, adminError };
