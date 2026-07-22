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
  }
}

module.exports = { ExternalApiError };
