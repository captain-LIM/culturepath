'use strict';

const fs = require('node:fs');
const { parse } = require('dotenv');
const { parseArgs } = require('node:util');

function safeCode(payload) {
  const value = String(payload?.error?.errorCode ?? payload?.errorCode ?? '');
  return /^[A-Z0-9_]{1,50}$/.test(value) ? value : null;
}

async function run(argv = process.argv.slice(2), {
  fetchImpl = globalThis.fetch, readFile = fs.readFileSync,
} = {}) {
  const { values } = parseArgs({ args: argv, strict: true, options: {
    live: { type: 'boolean', default: false }, 'env-file': { type: 'string', default: '.env' },
    'gateway-base-url': { type: 'string' }, 'use-existing-test-key': { type: 'boolean', default: false },
  } });
  if (!values.live) return { live: false, requests: 0, expectedRequests: 3 };
  if (!/^https:\/\/[a-z0-9]{1,10}\.apigw\.ntruss\.com\/tourrelay\/(test|prod)$/.test(values['gateway-base-url'] || '')) {
    throw new Error('INVALID_BASE_URL');
  }
  const env = parse(readFile(values['env-file']));
  const gatewayKey = values['use-existing-test-key'] ? env.NCP_TOUR_TEST_API_KEY?.trim() : env.NCP_TOUR_GATEWAY_API_KEY?.trim();
  const serviceKey = env.TOUR_API_KEY?.trim();
  if (!gatewayKey || !serviceKey) throw new Error('MISSING_KEY');
  const query = new URLSearchParams({ serviceKey, MobileOS: 'ETC', MobileApp: 'CulturePath',
    _type: 'json', pageNo: '1', numOfRows: '1' });
  const base = values['gateway-base-url'];
  const cases = [
    { name: 'missing-api-key', url: `${base}/KorService2/areaCode2?${query}`, method: 'GET', key: false, status: 401 },
    { name: 'post-not-allowed', url: `${base}/KorService2/areaCode2?${query}`, method: 'POST', key: true, status: 404 },
    { name: 'unknown-path', url: `${base}/KorService2/notConfigured?${query}`, method: 'GET', key: true, status: 404 },
  ];
  const checks = [];
  for (const item of cases) {
    const response = await fetchImpl(item.url, { method: item.method, redirect: 'error',
      signal: AbortSignal.timeout(10000), headers: item.key ? { 'x-ncp-apigw-api-key': gatewayKey } : {} });
    let payload = null;
    try { payload = JSON.parse(await response.text()); } catch {}
    checks.push({ name: item.name, status: response.status, gatewayCode: safeCode(payload) });
    if (response.status !== item.status) throw Object.assign(new Error('GUARD_CHECK_FAILED'), { checks });
  }
  return { live: true, ok: true, requests: checks.length, checks };
}

if (require.main === module) run().then(result => console.log(JSON.stringify(result, null, 2))).catch(error => {
  console.error(JSON.stringify({ code: ['INVALID_BASE_URL', 'MISSING_KEY', 'GUARD_CHECK_FAILED'].includes(error.message)
    ? error.message : 'GUARD_CHECK_FAILED', checks: error.checks || [] }));
  process.exitCode = 1;
});

module.exports = { run, safeCode };
