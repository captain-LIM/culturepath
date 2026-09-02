'use strict';

const crypto = require('node:crypto');
const pool = require('../config/db');
const { defaultStore: aiSessionStore } = require('./aiSessionStore');
const {
  lockAccountForDeletion,
  deleteLockedAccountData,
} = require('./accountDeletionService');

const DAY_MS = 24 * 60 * 60 * 1000;
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

function createToken(randomBytes = crypto.randomBytes) {
  return randomBytes(32).toString('base64url');
}

function asTime(value) {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

async function requestAccountDeletion(email, locale, options = {}) {
  const database = options.pool || pool;
  const mailer = options.mailer;
  const config = options.config;
  const clock = options.clock || Date.now;
  const randomBytes = options.randomBytes || crypto.randomBytes;
  if (!mailer || !config) throw new TypeError('mailer and config are required');

  const now = new Date(clock());
  const normalizedEmail = normalizeEmail(email);
  const normalizedLocale = normalizeLocale(locale);
  const connection = await database.getConnection();
  let delivery = null;

  try {
    // Keep global cleanup outside the user transaction so it cannot hold request-row
    // locks while waiting for the user lock used by both deletion entry points.
    const cleanupBefore = new Date(now.getTime() - DAY_MS);
    await connection.query(
      `DELETE FROM account_deletion_requests
       WHERE token_expires_at <= ? AND send_window_started_at <= ?`,
      [now, cleanupBefore],
    );
    await connection.beginTransaction();

    const [users] = await connection.query(
      'SELECT id, email FROM users WHERE email = ? FOR UPDATE',
      [normalizedEmail],
    );
    if (users.length === 0) {
      await connection.rollback();
      return { accepted: true, emailScheduled: false };
    }

    const user = users[0];
    const [requests] = await connection.query(
      `SELECT token_hash, last_sent_at, send_window_started_at, send_count
       FROM account_deletion_requests
       WHERE user_id = ?`,
      [user.id],
    );
    const previous = requests[0];
    const inCurrentWindow = previous
      && now.getTime() - asTime(previous.send_window_started_at) < DAY_MS;
    const cooldownActive = previous
      && now.getTime() - asTime(previous.last_sent_at)
        < config.resendCooldownSeconds * 1000;
    const dailyLimitReached = inCurrentWindow
      && Number(previous.send_count) >= config.maxSendsPerDay;

    if (cooldownActive || dailyLimitReached) {
      await connection.commit();
      return { accepted: true, emailScheduled: false };
    }

    const token = createToken(randomBytes);
    const tokenHash = hashToken(token);
    const expiresAt = new Date(now.getTime() + config.tokenTtlSeconds * 1000);
    const windowStartedAt = inCurrentWindow
      ? new Date(previous.send_window_started_at)
      : now;
    const sendCount = inCurrentWindow ? Number(previous.send_count) + 1 : 1;

    await connection.query(
      `INSERT INTO account_deletion_requests
         (user_id, token_hash, locale, token_expires_at, last_sent_at,
          send_window_started_at, send_count)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         token_hash = VALUES(token_hash),
         locale = VALUES(locale),
         token_expires_at = VALUES(token_expires_at),
         last_sent_at = VALUES(last_sent_at),
         send_window_started_at = VALUES(send_window_started_at),
         send_count = VALUES(send_count)`,
      [
        user.id,
        tokenHash,
        normalizedLocale,
        expiresAt,
        now,
        windowStartedAt,
        sendCount,
      ],
    );
    await connection.commit();
    delivery = { to: user.email, token, tokenHash, locale: normalizedLocale, expiresAt };

    try {
      await mailer.sendDeletionConfirmation(delivery);
      return { accepted: true, emailScheduled: true };
    } catch (error) {
      try {
        await connection.query(
          'DELETE FROM account_deletion_requests WHERE user_id = ? AND token_hash = ?',
          [user.id, tokenHash],
        );
      } catch {
        // A failed cleanup only leaves an unusable token until it expires.
      }
      return {
        accepted: true,
        emailScheduled: false,
        deliveryErrorCode: error?.code || 'EMAIL_DELIVERY_FAILED',
      };
    }
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
    // See requestAccountDeletion: release cleanup locks before locking a user.
    await connection.query(
      `DELETE FROM account_deletion_requests
       WHERE token_expires_at <= ? AND send_window_started_at <= ?`,
      [now, new Date(now.getTime() - DAY_MS)],
    );
    await connection.beginTransaction();
    const [candidateRows] = await connection.query(
      'SELECT user_id FROM account_deletion_requests WHERE token_hash = ?',
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
       WHERE token_hash = ? AND user_id = ? AND token_expires_at > ?
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
  SUPPORTED_LOCALES,
  normalizeEmail,
  normalizeLocale,
  hashToken,
  createToken,
  requestAccountDeletion,
  confirmAccountDeletion,
};
