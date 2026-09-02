'use strict';

const pool = require('../config/db');

const MAX_REPORT_CONTENT_LENGTH = 10000;
const MAX_REPORT_REASON_LENGTH = 500;
const SESSION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeOptionalText(value, maxLength, fieldName) {
  if (value == null) return null;
  if (typeof value !== 'string') {
    throw new RangeError(`${fieldName} must be a string.`);
  }
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > maxLength) {
    throw new RangeError(`${fieldName} is too long.`);
  }
  return normalized;
}

async function createAiContentReport(input = {}, dependencies = {}) {
  const database = dependencies.pool || pool;
  const userId = Number(input.userId);
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    throw new RangeError('A valid userId is required.');
  }
  const content = normalizeOptionalText(
    input.content,
    MAX_REPORT_CONTENT_LENGTH,
    'content',
  );
  if (!content) throw new RangeError('content is required.');
  const reason = normalizeOptionalText(
    input.reason,
    MAX_REPORT_REASON_LENGTH,
    'reason',
  );
  const sessionId = normalizeOptionalText(input.sessionId, 36, 'sessionId');
  if (sessionId && !SESSION_ID_PATTERN.test(sessionId)) {
    throw new RangeError('sessionId is invalid.');
  }

  const [result] = await database.query(
    `INSERT INTO ai_content_reports (user_id, session_id, content, reason)
     VALUES (?, ?, ?, ?)`,
    [userId, sessionId, content, reason],
  );
  return { id: Number(result.insertId), status: 'received' };
}

module.exports = {
  MAX_REPORT_CONTENT_LENGTH,
  MAX_REPORT_REASON_LENGTH,
  SESSION_ID_PATTERN,
  createAiContentReport,
};
