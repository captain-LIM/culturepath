'use strict';

function resolveLang(req) {
  const raw = String(req?.headers?.['accept-language'] || '').trim().toLowerCase();
  return raw.startsWith('en') ? 'en' : 'ko';
}

module.exports = { resolveLang };
