'use strict';

const fs = require('node:fs');
const { parseArgs } = require('node:util');
const { parse } = require('dotenv');

function smokeError(code) { return Object.assign(new Error(code), { code }); }

// No dotenv config, runtime imports or network at module import time.
async function run(argv = process.argv.slice(2), {
  readFile = fs.readFileSync, fetchImpl = globalThis.fetch,
} = {}) {
  let options;
  try {
    options = parseArgs({ args: argv, strict: true, options: {
      live: { type: 'boolean', default: false }, direct: { type: 'boolean', default: false },
      'env-file': { type: 'string', default: '.env' }, services: { type: 'string', default: 'tour' },
      suite: { type: 'string', default: 'search' }, 'max-requests': { type: 'string', default: '20' },
      'gateway-base-url': { type: 'string' }, 'use-existing-test-key': { type: 'boolean', default: false },
    } }).values;
  } catch { throw smokeError('INVALID_ARGUMENTS'); }
  if (options.services !== 'tour' || !['search', 'kor'].includes(options.suite)) throw smokeError('UNSUPPORTED_SUITE');
  const maxRequests = Number(options['max-requests']);
  const expectedRequests = options.suite === 'search' ? 2 : 12;
  if (!Number.isInteger(maxRequests) || maxRequests < expectedRequests || maxRequests > 60) {
    throw smokeError('INVALID_REQUEST_BUDGET');
  }
  if (!options.live) return { live: false, expectedRequests, requests: 0,
    message: 'Preview only. Pass --live to call TourAPI; default suite checks two search pages.' };
  let env;
  try { env = parse(readFile(options['env-file'])); } catch { throw smokeError('ENV_FILE_UNREADABLE'); }
  if (options['gateway-base-url']) {
    env.NCP_TOUR_GATEWAY_ENABLED = 'true';
    env.NCP_TOUR_GATEWAY_BASE_URL = options['gateway-base-url'];
    env.NCP_TOUR_GATEWAY_SERVICES = 'tour';
  }
  if (options['use-existing-test-key']) {
    env.NCP_TOUR_GATEWAY_API_KEY = env.NCP_TOUR_TEST_API_KEY;
  }
  // Require explicit runtime configuration; the fixed-size /tour/test/search URL is not used.
  if (options.direct) env.NCP_TOUR_GATEWAY_ENABLED = 'false';
  const { getExternalApiConfig } = require('../src/config/externalApis');
  const { createConfiguredPublicDataClient } = require('../src/services/publicDataClient');
  const { publicDataErrorContext } = require('../src/utils/externalApiError');
  const { PAGINATION_METADATA } = require('../src/utils/normalizePublicDataResponse');
  const config = getExternalApiConfig(env);
  if (!options.direct && (!config.gateway.enabled || !config.gateway.services.includes('tour'))) {
    throw smokeError('GATEWAY_NOT_ENABLED');
  }
  if (config.services.tour.baseUrl.replace(/\/$/, '') !== 'https://apis.data.go.kr/B551011/KorService2') {
    throw smokeError('UNEXPECTED_UPSTREAM');
  }
  config.maxRetries = 0;
  let requests = 0;
  const checks = [];
  const client = createConfiguredPublicDataClient('tour', { config, logger: { warn() {} },
    fetchImpl: async (...args) => {
      if (requests >= maxRequests) throw smokeError('REQUEST_BUDGET_EXHAUSTED');
      requests++;
      return fetchImpl(...args);
    } });
  async function check(operation, params, pageNo = 1, numOfRows = 1, requireItems = false) {
    const start = Date.now();
    const result = await client.get(operation, { params, pageNo, numOfRows });
    const metadata = result.pagination[PAGINATION_METADATA];
    if (!metadata?.pageNoProvided || !metadata.pageNoValid || !metadata.numOfRowsProvided ||
        !metadata.numOfRowsValid || !metadata.totalCountValid ||
        result.pagination.pageNo !== pageNo || result.pagination.numOfRows !== numOfRows ||
        result.items.length > numOfRows || (requireItems && result.items.length === 0)) {
      throw smokeError('RESPONSE_CONTRACT_FAILED');
    }
    checks.push({ operation, pageNo, numOfRows, resultCode: result.header.resultCode,
      itemCount: result.items.length, totalCount: result.pagination.totalCount, elapsedMs: Date.now() - start });
    return result;
  }
  try {
    const first = await check('searchKeyword2', { keyword: '\uacbd\ubcf5\uad81' }, 1, 2, true);
    const second = await check('searchKeyword2', { keyword: '\uacbd\ubcf5\uad81' }, 2, 2, true);
    if (first.items[0]?.contentid && first.items[0].contentid === second.items[0]?.contentid) {
      throw smokeError('PAGINATION_NOT_ADVANCING');
    }
    if (options.suite === 'kor') {
      await check('searchKeyword2', { keyword: '\uacbd\ubcf5\uad81', lDongRegnCd: '11' }, 1, 2, true);
      await check('areaBasedList2', { lDongRegnCd: '11', arrange: 'A' }, 1, 1, true);
      await check('locationBasedList2', { mapX: '126.9769', mapY: '37.5796', radius: '1000', arrange: 'E' }, 1, 1, true);
      await check('areaCode2', {}, 1, 1, true);
      await check('ldongCode2', { lDongListYn: 'N' }, 1, 1, true);
      await check('lclsSystmCode2', {}, 1, 1, true);
      const contentId = String(first.items[0]?.contentid || '');
      if (!/^\d+$/.test(contentId)) throw smokeError('INVALID_CONTENT_ID');
      const common = await check('detailCommon2', { contentId }, 1, 1, true);
      const item = common.items[0];
      const contentTypeId = String(item.contenttypeid || '');
      if (String(item.contentid) !== contentId || !/^\d+$/.test(contentTypeId)) throw smokeError('INVALID_CONTENT_ID');
      await check('detailIntro2', { contentId, contentTypeId });
      await check('detailInfo2', { contentId, contentTypeId });
      await check('detailImage2', { contentId, imageYN: 'Y' });
    }
    return { live: true, ok: true, transport: options.direct ? 'direct' : 'ncp-gateway', requests, checks };
  } catch (error) {
    const code = ['RESPONSE_CONTRACT_FAILED', 'PAGINATION_NOT_ADVANCING', 'INVALID_CONTENT_ID'].includes(error.code)
      ? error.code : 'UPSTREAM_CHECK_FAILED';
    return { live: true, ok: false, transport: options.direct ? 'direct' : 'ncp-gateway', requests, checks,
      error: { code, ...publicDataErrorContext(error) } };
  }
}

if (require.main === module) run().then(result => {
  console.log(JSON.stringify(result, null, 2));
  if (result.ok === false) process.exitCode = 1;
}).catch(error => {
  const allowed = ['INVALID_ARGUMENTS', 'UNSUPPORTED_SUITE', 'INVALID_REQUEST_BUDGET',
    'ENV_FILE_UNREADABLE', 'GATEWAY_NOT_ENABLED', 'UNEXPECTED_UPSTREAM', 'CONFIG_ERROR'];
  console.error(JSON.stringify({ code: allowed.includes(error.code) ? error.code : 'SMOKE_CONFIG_ERROR' }));
  process.exitCode = 1;
});
module.exports = { run };
