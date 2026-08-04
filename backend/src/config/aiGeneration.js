'use strict';

const DEFAULTS = Object.freeze({
  maxOutputTokens: 1600,
  model: 'google/gemini-2.5-flash-lite',
});

function boundedInteger(value, name, fallback, maximum) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new TypeError(`${name}는 1 이상 ${maximum} 이하의 정수여야 합니다.`);
  }
  return parsed;
}

function getAiGenerationConfig(env = process.env) {
  const model = String(env.OPENROUTER_MODEL || DEFAULTS.model).trim();
  if (!/^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:-]*$/i.test(model)) {
    throw new TypeError('OPENROUTER_MODEL 이름이 올바르지 않습니다.');
  }
  return Object.freeze({
    maxOutputTokens: boundedInteger(
      env.OPENROUTER_MAX_OUTPUT_TOKENS,
      'OPENROUTER_MAX_OUTPUT_TOKENS',
      DEFAULTS.maxOutputTokens,
      4096,
    ),
    model,
  });
}

module.exports = { DEFAULTS, getAiGenerationConfig };
