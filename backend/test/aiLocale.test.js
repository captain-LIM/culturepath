'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  AI_TEXT_KEYS,
  aiText,
  localizedCultureName,
  localizedRegionName,
  normalizeAiLang,
  responseLanguageInstruction,
} = require('../src/services/aiLocale');
const { CULTURE_CATEGORIES } = require('../src/config/cultureCategoryMap');
const { REGION_DEFINITIONS } = require('../src/config/regionCatalog');

test('normalizes only the four supported AI response languages', () => {
  assert.equal(normalizeAiLang('en-US'), 'en');
  assert.equal(normalizeAiLang('ja_JP'), 'ja');
  assert.equal(normalizeAiLang('zh-CN'), 'zh');
  assert.equal(normalizeAiLang('fr-FR'), 'ko');
});

test('localizes curated region and culture labels without changing canonical values', () => {
  assert.equal(localizedRegionName(REGION_DEFINITIONS.tongyeong, 'en'), 'Tongyeong');
  assert.equal(localizedRegionName(REGION_DEFINITIONS.tongyeong, 'ja'), '統営');
  assert.equal(localizedCultureName('문학', CULTURE_CATEGORIES, 'zh'), '文学');
  assert.deepEqual(CULTURE_CATEGORIES.includes('문학'), true);
});

test('defines localized safety guidance and a strict current-turn prompt instruction', () => {
  assert.ok(AI_TEXT_KEYS.length >= 20);
  assert.match(aiText('ratingGuidance', 'en'), /rating data/i);
  assert.match(aiText('ratingGuidance', 'ja'), /評価/);
  assert.match(aiText('ratingGuidance', 'zh'), /评分/);
  assert.match(responseLanguageInstruction('en'), /current response language overrides/i);
  assert.match(responseLanguageInstruction('ja'), /Japanese/);
});
