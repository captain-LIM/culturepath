'use strict';

const nodemailer = require('nodemailer');

const COPY = Object.freeze({
  ko: {
    subject: '[CulturePath] 계정 삭제 요청을 확인해 주세요',
    heading: '계정 삭제 요청 확인',
    body: '아래 링크에서 계정 삭제를 최종 확인해 주세요. 링크는 제한된 시간 동안 한 번만 사용할 수 있습니다.',
    action: '계정 삭제 확인',
    ignore: '본인이 요청하지 않았다면 이 메일을 무시해 주세요.',
  },
  en: {
    subject: '[CulturePath] Confirm your account deletion request',
    heading: 'Confirm account deletion',
    body: 'Use the link below to confirm account deletion. The link is single-use and expires after a limited time.',
    action: 'Confirm account deletion',
    ignore: 'If you did not make this request, you can ignore this email.',
  },
  ja: {
    subject: '[CulturePath] アカウント削除リクエストをご確認ください',
    heading: 'アカウント削除の確認',
    body: '以下のリンクからアカウント削除を確定してください。リンクは有効期限付きで、一度だけ使用できます。',
    action: 'アカウント削除を確認',
    ignore: 'このリクエストに心当たりがない場合は、このメールを無視してください。',
  },
  zh: {
    subject: '[CulturePath] 请确认账号删除请求',
    heading: '确认删除账号',
    body: '请通过以下链接确认删除账号。该链接有时效限制，且仅可使用一次。',
    action: '确认删除账号',
    ignore: '如果并非您本人发起请求，请忽略此邮件。',
  },
});

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function buildConfirmationUrl(publicBaseUrl, token, locale = 'ko') {
  const url = new URL('/account-deletion/confirm', publicBaseUrl);
  url.searchParams.set('lang', COPY[locale] ? locale : 'ko');
  url.hash = `token=${encodeURIComponent(token)}`;
  return url.toString();
}

function buildMessage({ publicBaseUrl, token, locale }) {
  const selectedLocale = COPY[locale] ? locale : 'ko';
  const copy = COPY[selectedLocale];
  const confirmationUrl = buildConfirmationUrl(publicBaseUrl, token, selectedLocale);
  return {
    subject: copy.subject,
    text: `${copy.heading}\n\n${copy.body}\n\n${confirmationUrl}\n\n${copy.ignore}`,
    html: `<!doctype html><html lang="${selectedLocale}"><body><h1>${escapeHtml(copy.heading)}</h1><p>${escapeHtml(copy.body)}</p><p><a href="${escapeHtml(confirmationUrl)}">${escapeHtml(copy.action)}</a></p><p>${escapeHtml(copy.ignore)}</p></body></html>`,
  };
}

function createAccountDeletionMailer(config, options = {}) {
  const transport = options.transport || nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    requireTLS: !config.smtp.secure,
    auth: {
      user: config.smtp.user,
      pass: config.smtp.password,
    },
  });

  return {
    async sendDeletionConfirmation({ to, token, locale }) {
      const message = buildMessage({
        publicBaseUrl: config.publicBaseUrl,
        token,
        locale,
      });
      await transport.sendMail({
        from: config.smtp.from,
        to,
        ...message,
      });
    },
  };
}

module.exports = {
  COPY,
  buildConfirmationUrl,
  buildMessage,
  createAccountDeletionMailer,
};
