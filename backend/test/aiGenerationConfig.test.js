'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { DEFAULTS, getAiGenerationConfig } = require('../src/config/aiGeneration');

test('uses the approved low-cost non-streaming generation defaults', () => {
  assert.deepEqual(getAiGenerationConfig({}), {
    maxOutputTokens: 1600,
    model: 'google/gemini-2.5-flash-lite',
  });
  assert.equal(DEFAULTS.model, 'google/gemini-2.5-flash-lite');
});

test('validates configured model names and bounded output tokens', () => {
  assert.deepEqual(getAiGenerationConfig({
    OPENROUTER_MODEL: 'provider/model-v1',
    OPENROUTER_MAX_OUTPUT_TOKENS: '2048',
  }), {
    maxOutputTokens: 2048,
    model: 'provider/model-v1',
  });
  assert.throws(() => getAiGenerationConfig({ OPENROUTER_MODEL: 'auto' }), /이름/);
  assert.throws(() => getAiGenerationConfig({ OPENROUTER_MAX_OUTPUT_TOKENS: '4097' }), /4096 이하/);
});
