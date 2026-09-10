'use strict';
// Local launcher: sources and ONE Gateway key travel over SSH stdin, never argv.
// No remote files, environment mutations, deployments, or management credentials.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { parse } = require('dotenv');
const { parseArgs } = require('node:util');

function bundle() {
  const root = path.resolve(__dirname, '..');
  const files = {};
  function visit(id) {
    if (files[id]) return;
    const full = path.resolve(root, id);
    if (!full.startsWith(root + path.sep)) throw Error('OUTSIDE_ROOT');
    const source = fs.readFileSync(full, 'utf8');
    files[id] = source;
    for (const match of source.matchAll(/require\(['"]([^'"]+)['"]\)/g)) {
      if (!match[1].startsWith('.')) continue;
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(id), match[1]));
      visit(resolved.endsWith('.js') ? resolved : resolved + '.js');
    }
  }
  visit('scripts/smokeNcpTourGateway.js');
  return files;
}

function remoteMain(files, gatewayKey, suite, stage) {
  const nativeRequire = require;
  const cache = {};
  function load(id) {
    if (cache[id]) return cache[id].exports;
    if (!Object.hasOwn(files, id)) throw Error('MODULE_NOT_BUNDLED');
    const module = { exports: {} };
    cache[id] = module;
    const localRequire = name => {
      if (!name.startsWith('.')) {
        if (name === 'dotenv') return { parse: nativeRequire('dotenv').parse, config: () => ({}) };
        if (!name.startsWith('node:')) throw Error('EXTERNAL_MODULE_REFUSED');
        return nativeRequire(name);
      }
      let resolved = nativeRequire('node:path').posix.normalize(nativeRequire('node:path').posix.join(nativeRequire('node:path').posix.dirname(id), name));
      if (!resolved.endsWith('.js')) resolved += '.js';
      return load(resolved);
    };
    new Function('require', 'module', 'exports', files[id])(localRequire, module, module.exports);
    return module.exports;
  }
  const expectedService = '986530be-f166-44e5-b23e-5c414a7a3f2c';
  const expectedEnv = '0291074c-38bd-444c-9b8f-52633521e5e7';
  if (process.env.RAILWAY_SERVICE_ID !== expectedService || process.env.RAILWAY_ENVIRONMENT_ID !== expectedEnv || !process.env.TOUR_API_KEY) {
    console.log(JSON.stringify({ ok: false, code: 'REMOTE_PREFLIGHT_FAILED' })); process.exitCode = 1; return;
  }
  console.log(JSON.stringify({ event: 'remote-context', node: process.version,
    serviceId: expectedService, environmentId: expectedEnv, deploymentId: process.env.RAILWAY_DEPLOYMENT_ID }));
  const values = { TOUR_API_KEY: process.env.TOUR_API_KEY,
    NCP_TOUR_GATEWAY_ENABLED: 'true', NCP_TOUR_GATEWAY_SERVICES: 'tour',
    NCP_TOUR_GATEWAY_BASE_URL: `https://l4cnvpwq85.apigw.ntruss.com/tourrelay/${stage}`,
    NCP_TOUR_GATEWAY_API_KEY: gatewayKey };
  const envText = Object.entries(values).map(([k,v]) => `${k}=${JSON.stringify(v)}`).join('\n');
  load('scripts/smokeNcpTourGateway.js').run(['--live', '--suite', suite, '--max-requests', suite === 'search' ? '2' : '12'],
    { readFile: () => envText }).then(result => {
    console.log(JSON.stringify(result)); if (!result.ok) process.exitCode = 1;
  }).catch(() => { console.log(JSON.stringify({ ok: false, code: 'REMOTE_SMOKE_FAILED' })); process.exitCode = 1; });
}

async function run() {
  const { values } = parseArgs({ options: { live: { type: 'boolean', default: false },
    suite: { type: 'string', default: 'search' }, stage: { type: 'string', default: 'test' },
    identity: { type: 'string' } } });
  if (!['search', 'kor'].includes(values.suite)) throw Error('INVALID_SUITE');
  if (!['test', 'prod'].includes(values.stage)) throw Error('INVALID_STAGE');
  const files = bundle();
  if (!values.live) { console.log(JSON.stringify({ live: false, bundledFiles: Object.keys(files).length,
    expectedRequests: values.suite === 'search' ? 2 : 12 })); return; }
  if (!values.identity) throw Error('IDENTITY_REQUIRED');
  const env = parse(fs.readFileSync(path.resolve(__dirname, '../.env')));
  const key = env.NCP_TOUR_TEST_API_KEY;
  if (!key || !/^[\x21-\x7e]{1,512}$/.test(key)) throw Error('INVALID_GATEWAY_KEY');
  const program = `try { (${remoteMain.toString()})(${JSON.stringify(files)},${JSON.stringify(key)},${JSON.stringify(values.suite)},${JSON.stringify(values.stage)}); } catch { console.log('REMOTE_PREFLIGHT_FAILED'); process.exitCode = 1; }`;
  // Check syntax locally so an error cannot echo the secret-bearing source remotely.
  new Function(program);
  const args = ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', '-o', 'StrictHostKeyChecking=yes',
    '-o', 'IdentitiesOnly=yes', '-i', values.identity,
    'culturepath-backend-production.up.railway.app@ssh.railway.com', 'node', '-'];
  await new Promise((resolve, reject) => {
    const child = spawn('ssh', args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    const timer = setTimeout(() => { child.kill(); reject(Error('SSH_TIMEOUT')); }, 180000);
    child.stdout.on('data', d => process.stdout.write(d));
    child.stderr.on('data', d => process.stderr.write(d));
    child.on('error', () => { clearTimeout(timer); reject(Error('SSH_FAILED')); });
    child.stdin.on('error', () => {});
    child.on('close', (code, signal) => { clearTimeout(timer); process.exitCode = signal ? 1 : (code ?? 1); resolve(); });
    child.stdin.end(program);
  });
}
if (require.main === module) run().catch(() => { console.error('RAILWAY_SMOKE_FAILED'); process.exitCode = 1; });
module.exports = { bundle };
