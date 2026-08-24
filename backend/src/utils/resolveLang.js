'use strict';

function resolveLang(req) {
  const raw = String(req?.headers?.['accept-language'] || '').trim().toLowerCase();
  if (raw.startsWith('en')) return 'en';
  if (raw.startsWith('ja')) return 'ja';
  if (raw.startsWith('zh')) return 'zh';
  return 'ko';
}

module.exports = { resolveLang };
