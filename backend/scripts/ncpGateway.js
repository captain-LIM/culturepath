'use strict';
const fs = require('node:fs');
const { parseArgs } = require('node:util');
const { parse } = require('dotenv');
const { createNcpGatewayAdminClient, adminError } = require('./lib/ncpGatewayAdminClient');
const { createManifest } = require('./lib/ncpGatewayManifest');
const { inspectGateway, planGateway } = require('./lib/ncpGatewayPlanner');

async function run(argv = process.argv.slice(2), { readFile = fs.readFileSync, fetchImpl = globalThis.fetch } = {}) {
  let parsed;
  try { parsed = parseArgs({ args: argv, allowPositionals: true, strict: true, options: {
    'env-file': { type: 'string' }, services: { type: 'string', default: 'tour' },
    stage: { type: 'string', default: 'test' }, offline: { type: 'boolean', default: false },
  } }); } catch { throw adminError('INVALID_ARGUMENTS'); }
  const { values, positionals } = parsed;
  if (positionals.length !== 1 || !['inspect', 'plan', 'manifest'].includes(positionals[0])) {
    throw adminError('READ_ONLY_COMMANDS_ONLY');
  }
  const command = positionals[0];
  const manifest = createManifest({ services: values.services, stage: values.stage });
  if (command === 'manifest') return manifest;
  if (values.offline) {
    if (command !== 'plan') throw adminError('OFFLINE_PLAN_ONLY');
    return planGateway(manifest);
  }
  if (!values['env-file']) throw adminError('ENV_FILE_REQUIRED');
  let env;
  try { env = parse(readFile(values['env-file'])); } catch { throw adminError('ENV_FILE_UNREADABLE'); }
  const productId = env.NCP_GATEWAY_PRODUCT_ID?.trim();
  const client = createNcpGatewayAdminClient({ productId,
    accessKey: env.NCP_ADMIN_ACCESS_KEY?.trim(), secretKey: env.NCP_ADMIN_SECRET_KEY?.trim(), fetchImpl });
  const inventory = await inspectGateway(client, { productId, apiId: env.NCP_GATEWAY_API_ID?.trim() || undefined });
  return command === 'inspect' ? inventory : planGateway(manifest, inventory);
}

if (require.main === module) run().then(result => console.log(JSON.stringify(result, null, 2))).catch(error => {
  // No stack/message output: fs/parse/fetch errors may contain secrets or paths.
  const allowed = ['INVALID_ARGUMENTS', 'READ_ONLY_COMMANDS_ONLY', 'OFFLINE_PLAN_ONLY', 'ENV_FILE_REQUIRED',
    'ENV_FILE_UNREADABLE', 'INVALID_ID', 'MISSING_OR_INVALID_CREDENTIALS', 'HTTP_ERROR', 'TIMEOUT',
    'NETWORK_ERROR', 'INVALID_RESPONSE', 'INCOMPLETE_API_LIST', 'INVALID_RESOURCE_LIST',
    'INVALID_STAGE_LIST', 'TARGET_MISMATCH', 'DUPLICATE_API_NAME'];
  console.error(JSON.stringify({ code: allowed.includes(error.code) ? error.code : 'INVALID_CONFIGURATION',
    status: Number.isInteger(error.status) ? error.status : null }));
  process.exitCode = 1;
});
module.exports = { run };
