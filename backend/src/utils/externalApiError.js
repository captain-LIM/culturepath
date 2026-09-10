'use strict';

class ExternalApiError extends Error {
  constructor(message, options = {}) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = 'ExternalApiError';
    this.code = options.code || 'EXTERNAL_API_ERROR';
    this.service = options.service || null;
    this.operation = options.operation || null;
    this.status = options.status ?? null;
    this.resultCode = options.resultCode ?? null;
    this.retryable = options.retryable === true;
    this.transport = options.transport || null;
    this.errorLayer = options.errorLayer || null;
    this.gatewayErrorCode = options.gatewayErrorCode || null;
    this.elapsedMs = options.elapsedMs ?? null;
  }
}

// Never serialize messages, causes, arbitrary provider strings, URLs or headers.
function publicDataErrorContext(error) {
  const { SERVICES, PARAMETERS } = require('../config/publicDataRoutes');
  const safe = { errorName: error instanceof ExternalApiError ? 'ExternalApiError' : 'Error' };
  if (Object.hasOwn(SERVICES, error?.service)) safe.service = error.service;
  if (Object.hasOwn(PARAMETERS, error?.operation)) safe.operation = error.operation;
  if (['direct', 'ncp-gateway'].includes(error?.transport)) safe.transport = error.transport;
  if (['client', 'gateway', 'upstream', 'unknown'].includes(error?.errorLayer)) safe.errorLayer = error.errorLayer;
  if (['CONFIG_ERROR', 'VALIDATION_ERROR', 'HTTP_ERROR', 'INVALID_RESPONSE', 'BUSINESS_ERROR',
    'TIMEOUT', 'NETWORK_ERROR', 'EXTERNAL_API_ERROR'].includes(error?.code)) safe.code = error.code;
  if (Number.isInteger(error?.status) && error.status >= 100 && error.status <= 599) safe.httpStatus = error.status;
  if (/^\d{1,4}$/.test(String(error?.resultCode ?? ''))) safe.resultCode = String(error.resultCode);
  if (/^\d{3}$/.test(String(error?.gatewayErrorCode ?? ''))) safe.gatewayErrorCode = String(error.gatewayErrorCode);
  if (Number.isFinite(error?.elapsedMs) && error.elapsedMs >= 0) safe.elapsedMs = Math.round(error.elapsedMs);
  return safe;
}

module.exports = { ExternalApiError, publicDataErrorContext };
