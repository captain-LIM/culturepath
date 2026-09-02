'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const backendRoot = path.join(__dirname, '..');

test('publishes complete privacy and terms pages at stable HTTPS app paths', () => {
  const appSource = fs.readFileSync(
    path.join(backendRoot, 'src', 'app.js'),
    'utf8',
  );
  const privacy = fs.readFileSync(
    path.join(backendRoot, 'public', 'privacy-policy', 'index.html'),
    'utf8',
  );
  const terms = fs.readFileSync(
    path.join(backendRoot, 'public', 'terms', 'index.html'),
    'utf8',
  );

  assert.match(appSource, /app\.get\('\/privacy-policy'/);
  assert.match(appSource, /app\.get\('\/terms'/);
  assert.match(privacy, /CulturePath 팀/);
  assert.match(terms, /CulturePath 팀/);
  for (const html of [privacy, terms]) {
    assert.match(html, /culturepath\.support@gmail\.com/);
    assert.match(html, /2026년 9월 2일/);
    assert.doesNotMatch(html, /【|support@culturepath\.app|culturepath\.app/);
  }
  assert.match(privacy, /Railway/);
  assert.match(privacy, /OpenRouter/);
  assert.match(privacy, /\/account-deletion/);
  assert.match(privacy, /회원 탈퇴 시 신고 내용·사유·연결된 세션 식별정보를 삭제/);
  assert.match(privacy, /report content, reasons, and linked session identifiers are deleted/);
  for (const html of [privacy, terms]) {
    assert.match(html, /만 14세 미만은 서비스를 이용하거나 가입할 수 없습니다/);
    assert.match(html, /Users under 14 may not use the Service or create an account/);
    assert.doesNotMatch(html, /법정대리인의 동의 없이|legal guardian's consent/);
  }
  assert.match(terms, /앱 안의 신고 기능/);
});
