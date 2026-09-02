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
  assert.match(privacy, /계정 삭제 확인 기록/);
  assert.match(privacy, /확인 링크는 발급 후 30분간 유효/);
  assert.match(privacy, /Account deletion verification/);
  assert.match(privacy, /confirmation links are valid for 30 minutes/);
  assert.match(privacy, /アカウント削除確認記録/);
  assert.match(privacy, /账号删除验证记录/);
  assert.match(privacy, /계정 삭제 확인 메일 발송\(Gmail SMTP\)/);
  assert.match(privacy, /account deletion confirmation email delivery \(Gmail SMTP\)/);
  assert.match(privacy, /アカウント削除確認メールの送信\(Gmail SMTP\)/);
  assert.match(privacy, /发送账号删除确认邮件（Gmail SMTP）/);
  for (const html of [privacy, terms]) {
    assert.match(html, /만 14세 미만은 서비스를 이용하거나 가입할 수 없습니다/);
    assert.match(html, /Users under 14 may not use the Service or create an account/);
    assert.doesNotMatch(html, /법정대리인의 동의 없이|legal guardian's consent/);
  }
  assert.match(terms, /앱 안의 신고 기능/);
});
