'use strict';

const { ExternalApiError } = require('../utils/externalApiError');
const { SERVICES, OPERATIONS } = require('./publicDataRoutes');
const DIRECT = Object.freeze({ name: 'direct' });

function invalid(variable) {
  return new ExternalApiError(`${variable} 설정이 올바르지 않습니다.`, { code: 'CONFIG_ERROR' });
}

function validateGatewayBaseUrl(value) {
  const raw = String(value || '').trim();
  // Validate the raw input before URL normalization can erase dot segments, etc.
  if (!/^https:\/\/[a-z0-9]{1,10}\.apigw\.ntruss\.com\/tourrelay\/(test|prod)\/?$/.test(raw)) {
    throw invalid('NCP_TOUR_GATEWAY_BASE_URL');
  }
  const url = new URL(raw);
  if (url.hostname === 'apigateway.apigw.ntruss.com') throw invalid('NCP_TOUR_GATEWAY_BASE_URL');
  return raw.replace(/\/$/, '');
}

function parseServices(value = 'tour') {
  const selected = String(value).split(',').map(s => s.trim());
  if (!selected.length || selected.some(s => !Object.hasOwn(SERVICES, s)) ||
      new Set(selected).size !== selected.length) throw invalid('NCP_TOUR_GATEWAY_SERVICES');
  return Object.freeze(selected);
}

function getPublicDataTransportConfig(env = process.env) {
  const flag = String(env.NCP_TOUR_GATEWAY_ENABLED || 'false').trim().toLowerCase();
  if (!['true', 'false', '1', '0'].includes(flag)) throw invalid('NCP_TOUR_GATEWAY_ENABLED');
  if (flag === 'false' || flag === '0') return Object.freeze({ enabled: false });
  const baseUrl = validateGatewayBaseUrl(env.NCP_TOUR_GATEWAY_BASE_URL);
  const apiKey = String(env.NCP_TOUR_GATEWAY_API_KEY || '').trim();
  if (!/^[\x21-\x7e]{1,512}$/.test(apiKey)) throw invalid('NCP_TOUR_GATEWAY_API_KEY');
  return Object.freeze({ enabled: true, baseUrl, apiKey,
    services: parseServices(env.NCP_TOUR_GATEWAY_SERVICES || 'tour') });
}

function resolvePublicDataTransport(serviceName, originalBaseUrl, config) {
  if (!config?.enabled || !config.services.includes(serviceName)) return DIRECT;
  const segment = SERVICES[serviceName];
  const original = String(originalBaseUrl || '').replace(/\/$/, '');
  if (!segment || original !== `https://apis.data.go.kr/B551011/${segment}`) {
    throw invalid('공공데이터 원본 Base URL');
  }
  const baseUrl = validateGatewayBaseUrl(config.baseUrl);
  if (!/^[\x21-\x7e]{1,512}$/.test(config.apiKey || '')) throw invalid('NCP_TOUR_GATEWAY_API_KEY');
  return Object.freeze({ name: 'ncp-gateway', baseUrl: `${baseUrl}/${segment}/`,
    apiKey: config.apiKey, operations: OPERATIONS[serviceName] });
}

function validateConfiguredTransports(config) {
  for (const service of Object.values(config.services)) {
    resolvePublicDataTransport(service.name, service.baseUrl, config.gateway);
  }
}

module.exports = { getPublicDataTransportConfig, parseServices, resolvePublicDataTransport,
  validateConfiguredTransports, validateGatewayBaseUrl };
