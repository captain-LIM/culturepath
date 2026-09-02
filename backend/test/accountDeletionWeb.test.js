'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  readAccountDeletionConfig,
  validateAccountDeletionConfig,
} = require('../src/config/accountDeletion');
const {
  ACCEPTED_MESSAGE,
  createAccountDeletionController,
} = require('../src/controllers/accountDeletionController');
const { requireSameOrigin } = require('../src/routes/accountDeletion');

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
  assert.ok(errors.some(message => message.includes('SMTP_HOST')));
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

test('SMTP failure logging excludes the submitted email and token', async () => {
  const logs = [];
  const controller = createAccountDeletionController({
    config: { enabled: true, minimumResponseMs: 0 }, mailer: {},
    requestDeletion: async () => ({ accepted: true, deliveryErrorCode: 'ECONNECTION' }),
    logger: { error: (...items) => logs.push(items) },
  });
  const res = responseRecorder();
  await controller.request({ body: { email: 'private@example.com', locale: 'ko' } }, res);
  const serialized = JSON.stringify(logs);
  assert.match(serialized, /ECONNECTION/);
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
});
