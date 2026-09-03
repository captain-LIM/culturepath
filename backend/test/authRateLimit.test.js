'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { createRateLimit } = require('../src/middleware/rateLimit');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

function fakeRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    set(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test('limits anonymous login/register attempts by IP, independently per IP', () => {
  let currentTime = 0;
  const middleware = createRateLimit({ max: 2, windowMs: 1000, now: () => currentTime });

  // 로그인/회원가입 요청에는 req.user가 없다 — 이메일이 달라도 같은 IP에서
  // 오면 같은 버킷을 공유해, 이메일을 바꿔가며 시도하는 우회를 막는다.
  const attacker = { ip: '203.0.113.5' };
  const resAttacker = fakeRes();
  let passed = 0;
  middleware(attacker, resAttacker, () => { passed += 1; });
  middleware(attacker, resAttacker, () => { passed += 1; });
  middleware(attacker, resAttacker, () => { passed += 1; });
  assert.equal(passed, 2);
  assert.equal(resAttacker.statusCode, 429);
  assert.ok(resAttacker.headers['Retry-After']);

  // 다른 IP는 별도 버킷이라 영향받지 않는다.
  const otherUser = { ip: '198.51.100.9' };
  const resOther = fakeRes();
  middleware(otherUser, resOther, () => { passed += 1; });
  assert.equal(passed, 3);
  assert.equal(resOther.statusCode, 200);

  // 창(window)이 지나면 다시 시도할 수 있다.
  currentTime = 1000;
  middleware(attacker, resAttacker, () => { passed += 1; });
  assert.equal(passed, 4);
});

test('wires rate limiting onto the register and login routes before validation', () => {
  const source = read('src/routes/auth.js');

  assert.match(source, /const loginRateLimit = createRateLimit\(/);
  assert.match(source, /const registerRateLimit = createRateLimit\(/);
  assert.match(
    source,
    /router\.post\(\s*'\/register',\s*registerRateLimit,/,
    'registerRateLimit must run on POST /register',
  );
  assert.match(
    source,
    /router\.post\(\s*'\/login',\s*loginRateLimit,/,
    'loginRateLimit must run on POST /login',
  );
});

test('supports a custom key generator without changing the default limiter contract', () => {
  const middleware = createRateLimit({
    max: 1,
    keyGenerator: request => request.clientKey,
  });
  let passed = 0;
  middleware({ clientKey: 'one' }, fakeRes(), () => { passed += 1; });
  middleware({ clientKey: 'two' }, fakeRes(), () => { passed += 1; });
  const limited = fakeRes();
  middleware({ clientKey: 'one' }, limited, () => { passed += 1; });
  assert.equal(passed, 2);
  assert.equal(limited.statusCode, 429);
});
