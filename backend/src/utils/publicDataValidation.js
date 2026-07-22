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

function requirePattern(value, name, pattern, context = {}, options = {}) {
  const missing = value === undefined || value === null || String(value).trim() === '';
  if (missing && options.optional) {
    return null;
  }

  if (missing || !pattern.test(String(value).trim())) {
    throw new ExternalApiError(`${name} 형식이 올바르지 않습니다.`, {
      code: 'VALIDATION_ERROR',
      service: context.service,
      operation: context.operation,
    });
  }

  return String(value).trim();
}

function requireOneOf(value, name, allowedValues, context = {}) {
  const normalized = String(value || '').trim().toUpperCase();
  if (!allowedValues.includes(normalized)) {
    throw new ExternalApiError(`${name} 값이 허용 범위를 벗어났습니다.`, {
      code: 'VALIDATION_ERROR',
      service: context.service,
      operation: context.operation,
    });
  }
  return normalized;
}

function normalizePagination(
  pageNo,
  numOfRows,
  context = {},
  options = {},
) {
  const defaultPageNo = options.defaultPageNo || 1;
  const defaultNumOfRows = options.defaultNumOfRows || 20;
  const maxNumOfRows = options.maxNumOfRows || 50;
  const normalizedPageNo = pageNo ?? defaultPageNo;
  const normalizedNumOfRows = numOfRows ?? defaultNumOfRows;

  if (
    !Number.isInteger(Number(normalizedPageNo)) ||
    Number(normalizedPageNo) < 1 ||
    !Number.isInteger(Number(normalizedNumOfRows)) ||
    Number(normalizedNumOfRows) < 1 ||
    Number(normalizedNumOfRows) > maxNumOfRows
  ) {
    throw new ExternalApiError(
      `pageNo는 1 이상, numOfRows는 1~${maxNumOfRows} 범위여야 합니다.`,
      {
        code: 'VALIDATION_ERROR',
        service: context.service,
        operation: context.operation,
      },
    );
  }

  return {
    pageNo: Number(normalizedPageNo),
    numOfRows: Number(normalizedNumOfRows),
  };
}

module.exports = {
  normalizePagination,
  requireDatePattern,
  requireOneOf,
  requirePattern,
  requireStringParams,
};
