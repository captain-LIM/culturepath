'use strict';

const { ExternalApiError } = require('./externalApiError');

function requireStringParams(params, names, context = {}) {
  for (const name of names) {
    const value = params?.[name];
    if (value === undefined || value === null || String(value).trim() === '') {
      throw new ExternalApiError(`필수 파라미터가 없습니다: ${name}`, {
        code: 'VALIDATION_ERROR',
        service: context.service,
        operation: context.operation,
      });
    }
  }
}

function requireDatePattern(value, name, pattern, context = {}) {
  if (!pattern.test(String(value))) {
    throw new ExternalApiError(`${name} 형식이 올바르지 않습니다.`, {
      code: 'VALIDATION_ERROR',
      service: context.service,
      operation: context.operation,
    });
  }
}

module.exports = { requireDatePattern, requireStringParams };
