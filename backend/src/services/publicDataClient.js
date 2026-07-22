'use strict';

const { getExternalApiConfig } = require('../config/externalApis');
const { ExternalApiError } = require('../utils/externalApiError');
const {
  normalizePublicDataResponse,
} = require('../utils/normalizePublicDataResponse');

const OPERATION_PATTERN = /^[A-Za-z0-9]+$/;
const RETRYABLE_STATUS_CODES = new Set([408, 425, 429]);

function normalizeServiceKey(rawKey) {
  const key = String(rawKey || '').trim();
  if (!key) {
    return '';
  }

  if (!/%[0-9A-Fa-f]{2}/.test(key)) {
    return key;
  }

  try {
    return decodeURIComponent(key);
  } catch {
    return key;
  }
}

function isRetryableStatus(status) {
  return RETRYABLE_STATUS_CODES.has(status) || status >= 500;
}

function wait(milliseconds) {
  if (milliseconds <= 0) {
    return Promise.resolve();
  }
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function createPublicDataClient(options) {
  const {
    serviceName,
    baseUrl,
    apiKey,
    mobileOs = 'ETC',
    mobileApp = 'CulturePath',
    timeoutMs = 8000,
    maxRetries = 1,
    retryDelayMs = 200,
    fetchImpl = globalThis.fetch,
    logger = console,
  } = options || {};

  const normalizedKey = normalizeServiceKey(apiKey);
  const retryLimit = Math.min(
    1,
    Math.max(0, Number.isInteger(Number(maxRetries)) ? Number(maxRetries) : 1),
  );

  if (!serviceName || !baseUrl || !normalizedKey) {
    throw new ExternalApiError('공공데이터 API 설정이 누락되었습니다.', {
      code: 'CONFIG_ERROR',
      service: serviceName,
    });
  }

  if (typeof fetchImpl !== 'function') {
    throw new ExternalApiError('사용 가능한 fetch 구현이 없습니다.', {
      code: 'CONFIG_ERROR',
      service: serviceName,
    });
  }

  let normalizedBaseUrl;
  try {
    normalizedBaseUrl = new URL(baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
  } catch (cause) {
    throw new ExternalApiError('공공데이터 API Base URL이 올바르지 않습니다.', {
      code: 'CONFIG_ERROR',
      service: serviceName,
      cause,
    });
  }

  function buildUrl(operation, params, pageNo, numOfRows) {
    if (!OPERATION_PATTERN.test(operation)) {
      throw new ExternalApiError('공공데이터 API 작업명이 올바르지 않습니다.', {
        code: 'VALIDATION_ERROR',
        service: serviceName,
        operation,
      });
    }

    if (
      !Number.isInteger(Number(pageNo)) ||
      Number(pageNo) < 1 ||
      !Number.isInteger(Number(numOfRows)) ||
      Number(numOfRows) < 1
    ) {
      throw new ExternalApiError('페이지 번호와 페이지 크기는 양의 정수여야 합니다.', {
        code: 'VALIDATION_ERROR',
        service: serviceName,
        operation,
      });
    }

    const url = new URL(operation, normalizedBaseUrl);
    for (const [name, value] of Object.entries(params || {})) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(name, String(value));
      }
    }

    url.searchParams.set('serviceKey', normalizedKey);
    url.searchParams.set('MobileOS', mobileOs);
    url.searchParams.set('MobileApp', mobileApp);
    url.searchParams.set('_type', 'json');
    url.searchParams.set('pageNo', String(pageNo));
    url.searchParams.set('numOfRows', String(numOfRows));
    return url;
  }

  async function execute(operation, url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchImpl(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new ExternalApiError(
          `공공데이터 HTTP 오류(${response.status})가 발생했습니다.`,
          {
            code: 'HTTP_ERROR',
            service: serviceName,
            operation,
            status: response.status,
            retryable: isRetryableStatus(response.status),
          },
        );
      }

      const responseText = (await response.text()).replace(/^\uFEFF/, '');
      let payload;
      try {
        payload = JSON.parse(responseText);
      } catch (cause) {
        throw new ExternalApiError('공공데이터 JSON 응답을 해석하지 못했습니다.', {
          code: 'INVALID_RESPONSE',
          service: serviceName,
          operation,
          cause,
        });
      }

      return normalizePublicDataResponse(payload, {
        service: serviceName,
        operation,
      });
    } catch (error) {
      if (error instanceof ExternalApiError) {
        throw error;
      }

      const timedOut = controller.signal.aborted || error?.name === 'AbortError';
      throw new ExternalApiError(
        timedOut
          ? '공공데이터 요청 시간이 초과되었습니다.'
          : '공공데이터 네트워크 요청에 실패했습니다.',
        {
          code: timedOut ? 'TIMEOUT' : 'NETWORK_ERROR',
          service: serviceName,
          operation,
          retryable: true,
        },
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  async function get(operation, requestOptions = {}) {
    const {
      params = {},
      pageNo = 1,
      numOfRows = 10,
    } = requestOptions;
    const url = buildUrl(operation, params, pageNo, numOfRows);

    for (let attempt = 0; ; attempt += 1) {
      try {
        return await execute(operation, url);
      } catch (error) {
        if (!(error instanceof ExternalApiError)) {
          throw error;
        }

        if (!error.retryable || attempt >= retryLimit) {
          throw error;
        }

        logger?.warn?.('공공데이터 요청을 재시도합니다.', {
          service: serviceName,
          operation,
          attempt: attempt + 1,
          reason: error.code,
        });
        await wait(retryDelayMs);
      }
    }
  }

  return Object.freeze({ get });
}

function createConfiguredPublicDataClient(serviceKey, options = {}) {
  const config = options.config || getExternalApiConfig();
  const service = config.services?.[serviceKey];

  if (!service) {
    throw new ExternalApiError(`알 수 없는 공공데이터 서비스 설정: ${serviceKey}`, {
      code: 'CONFIG_ERROR',
      service: serviceKey,
    });
  }

  return createPublicDataClient({
    serviceName: service.name,
    baseUrl: service.baseUrl,
    apiKey: config.apiKey,
    mobileOs: config.mobileOs,
    mobileApp: config.mobileApp,
    timeoutMs: config.timeoutMs,
    maxRetries: config.maxRetries,
    retryDelayMs: config.retryDelayMs,
    fetchImpl: options.fetchImpl || globalThis.fetch,
    logger: options.logger || console,
  });
}

module.exports = {
  createConfiguredPublicDataClient,
  createPublicDataClient,
  normalizeServiceKey,
};
