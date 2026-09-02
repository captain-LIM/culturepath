'use strict';

const ALLOWED_ERROR_CODES = new Set([
  'EAUTH',
  'ECONNECTION',
  'ECONNREFUSED',
  'EENVELOPE',
  'EMESSAGE',
  'ESOCKET',
  'ETIMEDOUT',
  'PROTOCOL_CONNECTION_LOST',
  'ER_LOCK_DEADLOCK',
  'ER_LOCK_WAIT_TIMEOUT',
  'TypeError',
]);

function safeErrorCode(error) {
  for (const candidate of [error?.code, error?.name]) {
    if (ALLOWED_ERROR_CODES.has(candidate)) return candidate;
  }
  return 'ACCOUNT_DELETION_OPERATION_FAILED';
}

module.exports = { ALLOWED_ERROR_CODES, safeErrorCode };
