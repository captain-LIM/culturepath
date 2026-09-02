'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  COPY,
  buildConfirmationUrl,
  createAccountDeletionMailer,
} = require('../src/services/accountDeletionEmailService');

test('puts the secret token in the URL fragment instead of query parameters', () => {
  const url = buildConfirmationUrl('https://api.example.com/base', 'secret_token', 'en');
  assert.equal(url, 'https://api.example.com/account-deletion/confirm?lang=en#token=secret_token');
  assert.doesNotMatch(url.split('#')[0], /secret_token/);
});

test('sends localized plain-text and HTML confirmation mail without logging secrets', async t => {
  for (const locale of Object.keys(COPY)) {
    await t.test(locale, async () => {
      const messages = [];
      const mailer = createAccountDeletionMailer({
        publicBaseUrl: 'https://api.example.com',
        smtp: { from: 'CulturePath <support@example.com>' },
      }, { transport: { sendMail: async message => messages.push(message) } });
      await mailer.sendDeletionConfirmation({ to: 'user@example.com', token: 'token_value', locale });
      assert.equal(messages[0].to, 'user@example.com');
      assert.equal(messages[0].subject, COPY[locale].subject);
      assert.match(messages[0].text, /#token=token_value/);
      assert.match(messages[0].html, /#token=token_value/);
    });
  }
});
