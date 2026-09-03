'use strict';

const crypto = require('node:crypto');
const pool = require('../config/db');
const { defaultStore: aiSessionStore } = require('./aiSessionStore');
const {
  lockAccountForDeletion,
  deleteLockedAccountData,
} = require('./accountDeletionService');

const DAY_MS = 24 * 60 * 60 * 1000;
const TOKEN_NONCE_BYTES = 32;
const TOKEN_VERSION = 'culturepath-account-deletion:v1';
const SUPPORTED_LOCALES = new Set(['ko', 'en', 'ja', 'zh']);

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeLocale(value) {
  const locale = String(value || '').trim().toLowerCase();
  return SUPPORTED_LOCALES.has(locale) ? locale : 'ko';
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

function createNonce(randomBytes = crypto.randomBytes) {
  return randomBytes(TOKEN_NONCE_BYTES);
}

function deriveToken({ secret, userId, nonce }) {
  if (Buffer.byteLength(String(secret || ''), 'utf8') < 32) {
    throw new TypeError('Account deletion token secret must be at least 32 bytes');
  }
  const nonceBuffer = Buffer.isBuffer(nonce) ? nonce : Buffer.from(nonce);
  if (nonceBuffer.length !== TOKEN_NONCE_BYTES) {
    throw new TypeError('Account deletion token nonce must be 32 bytes');
  }
  const message = `${TOKEN_VERSION}:${Number(userId)}:${nonceBuffer.toString('base64url')}`;
  return crypto.createHmac('sha256', secret).update(message, 'utf8').digest('base64url');
}

// Kept for callers/tests that need a correctly shaped opaque token.
function createToken(randomBytes = crypto.randomBytes) {
  return randomBytes(TOKEN_NONCE_BYTES).toString('base64url');
}

function asTime(value) {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

async function requestAccountDeletion(email, locale, options = {}) {
  const database = options.pool || pool;
  const config = options.config;
  const clock = options.clock || Date.now;
  const randomBytes = options.randomBytes || crypto.randomBytes;
  if (!config) throw new TypeError('config is required');

  const now = new Date(clock());
  const normalizedEmail = normalizeEmail(email);
  const normalizedLocale = normalizeLocale(locale);
  const connection = await database.getConnection();

  try {
    await connection.beginTransaction();
    const [users] = await connection.query(
      'SELECT id FROM users WHERE email = ? FOR UPDATE',
      [normalizedEmail],
    );
    if (users.length === 0) {
      await connection.rollback();
      return { accepted: true, emailQueued: false };
    }

    const userId = users[0].id;
    const [requests] = await connection.query(
      `SELECT last_sent_at, send_window_started_at, send_count
       FROM account_deletion_requests
       WHERE user_id = ?`,
      [userId],
    );
    const previous = requests[0];
    const windowAgeMs = previous
      ? now.getTime() - asTime(previous.send_window_started_at)
      : Number.POSITIVE_INFINITY;
    const tokenLifetimeMs = config.tokenTtlSeconds * 1000;
    const inCurrentWindow = previous
      && windowAgeMs < DAY_MS - tokenLifetimeMs;
    const cooldownActive = previous
      && now.getTime() - asTime(previous.last_sent_at)
        < config.resendCooldownSeconds * 1000;
    const dailyLimitReached = inCurrentWindow
      && Number(previous.send_count) >= config.maxSendsPerDay;

    if (cooldownActive || dailyLimitReached) {
      await connection.commit();
      return { accepted: true, emailQueued: false };
    }

    const nonce = createNonce(randomBytes);
    const token = deriveToken({ secret: config.tokenSecret, userId, nonce });
    const tokenHash = hashToken(token);
    const initialExpiresAt = new Date(now.getTime() + tokenLifetimeMs);
    const windowStartedAt = inCurrentWindow
      ? new Date(previous.send_window_started_at)
      : now;
    const sendCount = inCurrentWindow ? Number(previous.send_count) + 1 : 1;

    await connection.query(
      `INSERT INTO account_deletion_requests
         (user_id, token_hash, token_nonce, locale, token_expires_at,
          last_sent_at, send_window_started_at, send_count, delivery_status,
          delivery_attempts, next_delivery_attempt_at, delivery_claimed_at,
          delivery_claim_id, last_delivery_error_code)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, NULL, NULL, NULL)
       ON DUPLICATE KEY UPDATE
         token_hash = VALUES(token_hash),
         token_nonce = VALUES(token_nonce),
         locale = VALUES(locale),
         token_expires_at = VALUES(token_expires_at),
         last_sent_at = VALUES(last_sent_at),
         send_window_started_at = VALUES(send_window_started_at),
         send_count = VALUES(send_count),
         delivery_status = 'pending',
         delivery_attempts = 0,
         next_delivery_attempt_at = VALUES(next_delivery_attempt_at),
         delivery_claimed_at = NULL,
         delivery_claim_id = NULL,
         last_delivery_error_code = NULL`,
      [
        userId,
        tokenHash,
        nonce,
        normalizedLocale,
        initialExpiresAt,
        now,
        windowStartedAt,
        sendCount,
        now,
      ],
    );
    await connection.commit();
    return { accepted: true, emailQueued: true };
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      // Preserve the original error.
    }
    throw error;
  } finally {
    connection.release();
  }
}

async function confirmAccountDeletion(token, options = {}) {
  const database = options.pool || pool;
  const sessionStore = options.sessionStore || aiSessionStore;
  const clock = options.clock || Date.now;
  const now = new Date(clock());
  const tokenHash = hashToken(token);
  const connection = await database.getConnection();

  try {
    await connection.beginTransaction();
    const [candidateRows] = await connection.query(
      `SELECT user_id FROM account_deletion_requests
       WHERE token_hash = ? AND delivery_status = 'sent'`,
      [tokenHash],
    );
    const candidate = candidateRows[0];
    if (!candidate) {
      await connection.rollback();
      return { deleted: false };
    }

    const accountExists = await lockAccountForDeletion(connection, candidate.user_id);
    if (!accountExists) {
      await connection.rollback();
      return { deleted: false };
    }

    const [requestRows] = await connection.query(
      `SELECT user_id FROM account_deletion_requests
       WHERE token_hash = ? AND user_id = ? AND delivery_status = 'sent'
         AND token_expires_at > ?
       FOR UPDATE`,
      [tokenHash, candidate.user_id, now],
    );
    if (requestRows.length === 0) {
      await connection.rollback();
      return { deleted: false };
    }

    await deleteLockedAccountData(connection, candidate.user_id);
    await connection.commit();
    sessionStore.removeAllForUser(candidate.user_id);
    return { deleted: true };
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      // Preserve the original error.
    }
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  DAY_MS,
  TOKEN_NONCE_BYTES,
  TOKEN_VERSION,
  SUPPORTED_LOCALES,
  normalizeEmail,
  normalizeLocale,
  hashToken,
  createNonce,
  deriveToken,
  createToken,
  requestAccountDeletion,
  confirmAccountDeletion,
};
