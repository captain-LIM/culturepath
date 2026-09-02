'use strict';

const crypto = require('node:crypto');
const pool = require('../config/db');
const { deriveToken } = require('./accountDeletionRequestService');
const { safeErrorCode } = require('../utils/safeErrorCode');

const DAY_MS = 24 * 60 * 60 * 1000;
const RETRY_DELAYS_MS = Object.freeze([60_000, 300_000, 900_000]);

function safeLog(logger, message, metadata) {
  try {
    logger.error(message, metadata);
  } catch {
    // Logging must never turn a handled delivery failure into an unhandled rejection.
  }
}

function safeInfo(logger, message, metadata) {
  try {
    logger.info?.(message, metadata);
  } catch {
    // Operational logging must not stop worker progress.
  }
}

function retryDelayMs(attempt) {
  return RETRY_DELAYS_MS[Math.min(Math.max(attempt - 1, 0), RETRY_DELAYS_MS.length - 1)];
}

async function cleanupExpiredAccountDeletionRequests(options = {}) {
  const database = options.pool || pool;
  const clock = options.clock || Date.now;
  const cutoff = new Date(clock() - DAY_MS);
  const [result] = await database.query(
    'DELETE FROM account_deletion_requests WHERE send_window_started_at <= ?',
    [cutoff],
  );
  return { deletedCount: Number(result.affectedRows || 0) };
}

async function claimDeliveryJobs(options = {}) {
  const database = options.pool || pool;
  const config = options.config;
  const clock = options.clock || Date.now;
  const randomUuid = options.randomUuid || crypto.randomUUID;
  const now = new Date(clock());
  const leaseBefore = new Date(now.getTime() - config.workerLeaseSeconds * 1000);
  const claimId = randomUuid();
  const connection = await database.getConnection();

  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      `SELECT requests.id, requests.user_id, requests.token_nonce,
              requests.locale, requests.delivery_attempts, users.email
       FROM account_deletion_requests AS requests
       INNER JOIN users ON users.id = requests.user_id
       WHERE (requests.delivery_status = 'pending'
              AND requests.next_delivery_attempt_at <= ?)
          OR (requests.delivery_status = 'processing'
              AND requests.delivery_claimed_at <= ?)
       ORDER BY requests.next_delivery_attempt_at, requests.id
       LIMIT ?
       FOR UPDATE SKIP LOCKED`,
      [now, leaseBefore, config.workerBatchSize],
    );
    if (rows.length === 0) {
      await connection.commit();
      return [];
    }

    const placeholders = rows.map(() => '?').join(', ');
    await connection.query(
      `UPDATE account_deletion_requests
       SET delivery_status = 'processing', delivery_claimed_at = ?,
           delivery_claim_id = ?
       WHERE id IN (${placeholders})`,
      [now, claimId, ...rows.map(row => row.id)],
    );
    await connection.commit();
    return rows.map(row => ({ ...row, claimId }));
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      // Preserve the claim failure.
    }
    throw error;
  } finally {
    connection.release();
  }
}

async function markDeliverySucceeded(job, options = {}) {
  const database = options.pool || pool;
  const config = options.config;
  const clock = options.clock || Date.now;
  const expiresAt = new Date(clock() + config.tokenTtlSeconds * 1000);
  await database.query(
    `UPDATE account_deletion_requests
     SET delivery_status = 'sent', token_nonce = NULL,
         token_expires_at = ?, delivery_claimed_at = NULL,
         delivery_claim_id = NULL, next_delivery_attempt_at = NULL,
         last_delivery_error_code = NULL
     WHERE id = ? AND delivery_status = 'processing'
       AND delivery_claim_id = ?`,
    [expiresAt, job.id, job.claimId],
  );
}

async function markDeliveryFailed(job, error, options = {}) {
  const database = options.pool || pool;
  const config = options.config;
  const clock = options.clock || Date.now;
  const attempts = Number(job.delivery_attempts || 0) + 1;
  const terminal = attempts >= config.emailMaxAttempts;
  const nextAttemptAt = terminal
    ? null
    : new Date(clock() + retryDelayMs(attempts));
  const errorCode = safeErrorCode(error);
  await database.query(
    `UPDATE account_deletion_requests
     SET delivery_status = ?, delivery_attempts = ?,
         next_delivery_attempt_at = ?, delivery_claimed_at = NULL,
         delivery_claim_id = NULL, last_delivery_error_code = ?,
         token_nonce = IF(? = 'failed', NULL, token_nonce)
     WHERE id = ? AND delivery_status = 'processing'
       AND delivery_claim_id = ?`,
    [
      terminal ? 'failed' : 'pending',
      attempts,
      nextAttemptAt,
      errorCode,
      terminal ? 'failed' : 'pending',
      job.id,
      job.claimId,
    ],
  );
  return { terminal, attempts, errorCode, nextAttemptAt };
}

async function deliverJob(job, options = {}) {
  const mailer = options.mailer;
  const config = options.config;
  try {
    const nonce = Buffer.isBuffer(job.token_nonce)
      ? job.token_nonce
      : Buffer.from(job.token_nonce || []);
    const token = deriveToken({
      secret: config.tokenSecret,
      userId: job.user_id,
      nonce,
    });
    await mailer.sendDeletionConfirmation({
      to: job.email,
      token,
      locale: job.locale,
    });
    await markDeliverySucceeded(job, options);
    return { delivered: true };
  } catch (error) {
    const failure = await markDeliveryFailed(job, error, options);
    safeLog(options.logger || console, 'Account deletion email delivery failed', {
      code: failure.errorCode,
      attempt: failure.attempts,
      terminal: failure.terminal,
    });
    return { delivered: false, ...failure };
  }
}

async function runAccountDeletionWorkerTick(options = {}) {
  const jobs = await claimDeliveryJobs(options);
  const results = await Promise.all(jobs.map(job => deliverJob(job, options)));
  return { claimedCount: jobs.length, results };
}

function startAccountDeletionEmailWorker(options = {}) {
  const config = options.config;
  const clock = options.clock || Date.now;
  const setIntervalFn = options.setIntervalFn || setInterval;
  const clearIntervalFn = options.clearIntervalFn || clearInterval;
  const logger = options.logger || console;
  let stopped = false;
  let running = false;
  let active = Promise.resolve();
  let lastCleanupAt = 0;

  async function execute() {
    if (stopped || running) return;
    running = true;
    try {
      const now = clock();
      if (lastCleanupAt === 0 || now - lastCleanupAt >= config.cleanupIntervalMs) {
        const cleanup = await cleanupExpiredAccountDeletionRequests({ ...options, clock });
        if (cleanup.deletedCount > 0) {
          safeInfo(logger, 'Expired account deletion requests removed', {
            deletedCount: cleanup.deletedCount,
          });
        }
        lastCleanupAt = now;
      }
      await runAccountDeletionWorkerTick({ ...options, clock });
    } catch (error) {
      safeLog(logger, 'Account deletion email worker tick failed', {
        code: safeErrorCode(error),
      });
    } finally {
      running = false;
    }
  }

  function schedule() {
    if (stopped || running) return;
    active = execute();
  }

  schedule();
  const interval = setIntervalFn(schedule, config.workerPollMs);
  interval?.unref?.();

  return {
    async stop() {
      stopped = true;
      clearIntervalFn(interval);
      await active;
    },
  };
}

module.exports = {
  DAY_MS,
  RETRY_DELAYS_MS,
  safeErrorCode,
  retryDelayMs,
  cleanupExpiredAccountDeletionRequests,
  claimDeliveryJobs,
  markDeliverySucceeded,
  markDeliveryFailed,
  deliverJob,
  runAccountDeletionWorkerTick,
  startAccountDeletionEmailWorker,
};
