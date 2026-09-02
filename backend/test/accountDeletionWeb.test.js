'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  DEFAULTS,
  readAccountDeletionConfig,
  validateAccountDeletionConfig,
} = require('../src/config/accountDeletion');
const {
  ACCEPTED_MESSAGE,
  createAccountDeletionController,
} = require('../src/controllers/accountDeletionController');
const { requireSameOrigin } = require('../src/routes/accountDeletion');
const { resolveClientIp } = require('../src/middleware/clientIp');
const { createRateLimit } = require('../src/middleware/rateLimit');

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test('web form is disabled by default and enabled configuration fails fast when incomplete', () => {
  const disabled = readAccountDeletionConfig({});
  assert.equal(disabled.enabled, false);
  assert.deepEqual(validateAccountDeletionConfig(disabled, { production: true }), []);
  const enabled = readAccountDeletionConfig({ ACCOUNT_DELETION_WEB_FORM_ENABLED: 'true' });
  const errors = validateAccountDeletionConfig(enabled, { production: true });
  assert.ok(errors.some(message => message.includes('PUBLIC_BASE_URL')));
  assert.ok(errors.some(message => message.includes('TOKEN_SECRET')));
  assert.ok(errors.some(message => message.includes('SMTP_HOST')));
});

test('worker configuration accepts only positive values within operational bounds', () => {
  const config = readAccountDeletionConfig({
    ACCOUNT_DELETION_WORKER_POLL_MS: '0',
    ACCOUNT_DELETION_WORKER_BATCH_SIZE: '101',
    ACCOUNT_DELETION_WORKER_LEASE_SECONDS: '-1',
    ACCOUNT_DELETION_EMAIL_MAX_ATTEMPTS: '999',
    ACCOUNT_DELETION_CLEANUP_INTERVAL_MS: 'not-a-number',
  });
  assert.equal(config.workerPollMs, DEFAULTS.workerPollMs);
  assert.equal(config.workerBatchSize, DEFAULTS.workerBatchSize);
  assert.equal(config.workerLeaseSeconds, DEFAULTS.workerLeaseSeconds);
  assert.equal(config.emailMaxAttempts, DEFAULTS.emailMaxAttempts);
  assert.equal(config.cleanupIntervalMs, DEFAULTS.cleanupIntervalMs);
});

test('request response is generic for existing and missing accounts and observes minimum delay', async () => {
  for (const emailScheduled of [true, false]) {
    let current = 100;
    const delays = [];
    const controller = createAccountDeletionController({
      config: { enabled: true, minimumResponseMs: 600 },
      mailer: {},
      clock: () => current,
      delay: async ms => { delays.push(ms); current += ms; },
      requestDeletion: async () => ({ accepted: true, emailScheduled }),
      logger: { error() {} },
    });
    const res = responseRecorder();
    await controller.request({ body: { email: 'user@example.com', locale: 'ko' } }, res);
    assert.equal(res.statusCode, 202);
    assert.equal(res.body.message, ACCEPTED_MESSAGE);
    assert.deepEqual(delays, [600]);
  }
});

test('request failure logging excludes the submitted email and token', async () => {
  const logs = [];
  const controller = createAccountDeletionController({
    config: { enabled: true, minimumResponseMs: 0 }, mailer: {},
    requestDeletion: async () => {
      throw Object.assign(new Error('private@example.com token-value'), { code: 'ER_LOCK_WAIT_TIMEOUT' });
    },
    logger: { error: (...items) => logs.push(items) },
  });
  const res = responseRecorder();
  await controller.request({ body: { email: 'private@example.com', locale: 'ko' } }, res);
  const serialized = JSON.stringify(logs);
  assert.match(serialized, /ER_LOCK_WAIT_TIMEOUT/);
  assert.doesNotMatch(serialized, /private@example\.com|token/i);
});

test('honeypot request returns generic acceptance without touching account storage', async () => {
  let called = false;
  const controller = createAccountDeletionController({
    config: { enabled: true, minimumResponseMs: 0 }, mailer: {},
    requestDeletion: async () => { called = true; }, logger: { error() {} },
  });
  const res = responseRecorder();
  await controller.request({ body: { website: 'spam' } }, res);
  assert.equal(res.statusCode, 202);
  assert.equal(called, false);
});

test('confirmation requires a successful single-use service result', async () => {
  for (const deleted of [true, false]) {
    const controller = createAccountDeletionController({
      config: { enabled: true }, mailer: {},
      confirmDeletion: async () => ({ deleted }), logger: { error() {} },
    });
    const res = responseRecorder();
    await controller.confirm({ body: { token: 'token' } }, res);
    assert.equal(res.statusCode, deleted ? 200 : 400);
  }
});

test('confirmation rejects cross-site browser requests', () => {
  const middleware = requireSameOrigin('https://api.example.com');
  for (const headers of [
    { Origin: 'https://evil.example' },
    { 'Sec-Fetch-Site': 'cross-site' },
  ]) {
    const res = responseRecorder();
    let next = false;
    middleware({ get: name => headers[name] }, res, () => { next = true; });
    assert.equal(res.statusCode, 403);
    assert.equal(next, false);
  }
});

test('uses Railway X-Real-IP only in Railway and ignores forged forwarding chains', () => {
  const railwayRequest = {
    headers: {
      'x-real-ip': '203.0.113.7',
      'x-forwarded-for': '198.51.100.1',
    },
    socket: { remoteAddress: '10.0.0.2' },
  };
  assert.equal(
    resolveClientIp(railwayRequest, { RAILWAY_ENVIRONMENT_ID: 'production-id' }),
    '203.0.113.7',
  );
  assert.equal(resolveClientIp(railwayRequest, {}), '10.0.0.2');
  assert.equal(resolveClientIp({
    headers: { 'x-real-ip': '203.0.113.7, 198.51.100.1' },
    socket: { remoteAddress: '::ffff:192.0.2.8' },
  }, { RAILWAY_ENVIRONMENT_ID: 'production-id' }), '192.0.2.8');
});

test('request and confirmation rate limits use independent buckets', () => {
  const keyGenerator = () => '203.0.113.7';
  const requestLimit = createRateLimit({ max: 1, keyGenerator });
  const confirmLimit = createRateLimit({ max: 1, keyGenerator });
  let requests = 0;
  let confirmations = 0;
  requestLimit({}, responseRecorder(), () => { requests += 1; });
  requestLimit({}, responseRecorder(), () => { requests += 1; });
  confirmLimit({}, responseRecorder(), () => { confirmations += 1; });
  assert.equal(requests, 1);
  assert.equal(confirmations, 1);
});

test('public pages implement a two-step form with mail fallback and no GET mutation', () => {
  const root = path.join(__dirname, '..');
  const requestPage = fs.readFileSync(path.join(root, 'public', 'account-deletion', 'index.html'), 'utf8');
  const confirmPage = fs.readFileSync(path.join(root, 'public', 'account-deletion', 'confirm.html'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'src', 'app.js'), 'utf8');
  const route = fs.readFileSync(path.join(root, 'src', 'routes', 'accountDeletion.js'), 'utf8');
  assert.match(requestPage, /action="\/account-deletion\/requests"/);
  assert.match(requestPage, /mailto:culturepath\.support@gmail\.com/);
  assert.match(requestPage, /navigator\.clipboard/);
  assert.match(requestPage, /비밀번호, Google 인증 토큰/);
  assert.match(confirmPage, /location\.hash/);
  assert.match(confirmPage, /history\.replaceState/);
  assert.match(confirmPage, /confirmation:'DELETE'/);
  assert.match(app, /app\.get\('\/account-deletion\/confirm'/);
  assert.match(app, /Cache-Control/);
  assert.doesNotMatch(app, /app\.get\([^\n]*delete/i);
  assert.match(route, /body\('email'\)\.isEmail/);
  assert.match(route, /body\('confirmation'\)\.equals\('DELETE'\)/);
  assert.match(route, /const requestLimiter = createRateLimit/);
  assert.match(route, /const confirmLimiter = createRateLimit/);
});
