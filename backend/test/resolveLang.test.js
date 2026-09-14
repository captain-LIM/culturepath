'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { resolveLang } = require('../src/utils/resolveLang');

test('resolves supported Accept-Language headers and safely defaults to Korean', () => {
  assert.equal(resolveLang({ headers: { 'accept-language': 'en-US' } }), 'en');
  assert.equal(resolveLang({ headers: { 'accept-language': 'ja-JP' } }), 'ja');
  assert.equal(resolveLang({ headers: { 'accept-language': 'zh-CN' } }), 'zh');
  assert.equal(resolveLang({ headers: { 'accept-language': 'fr-FR' } }), 'ko');
  assert.equal(resolveLang({ headers: {} }), 'ko');
});
