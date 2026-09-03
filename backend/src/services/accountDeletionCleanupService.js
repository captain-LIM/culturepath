'use strict';

const pool = require('../config/db');
const { safeErrorCode } = require('../utils/safeErrorCode');

const DAY_MS = 24 * 60 * 60 * 1000;

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

function safeErrorLog(logger, message, metadata) {
  try {
    logger.error(message, metadata);
  } catch {
    // Operational logging must not stop future cleanup attempts.
  }
}

function safeInfoLog(logger, message, metadata) {
  try {
    logger.info?.(message, metadata);
  } catch {
    // Operational logging must not stop future cleanup attempts.
  }
}

function startAccountDeletionCleanupScheduler(options = {}) {
  const intervalMs = options.intervalMs;
  const clock = options.clock || Date.now;
  const setIntervalFn = options.setIntervalFn || setInterval;
  const clearIntervalFn = options.clearIntervalFn || clearInterval;
  const logger = options.logger || console;
  let stopped = false;
  let running = false;
  let active = Promise.resolve();

  async function execute() {
    if (stopped || running) return;
    running = true;
    try {
      const result = await cleanupExpiredAccountDeletionRequests({
        pool: options.pool,
        clock,
      });
      if (result.deletedCount > 0) {
        safeInfoLog(logger, 'Expired account deletion requests removed', {
          deletedCount: result.deletedCount,
        });
      }
    } catch (error) {
      safeErrorLog(logger, 'Account deletion cleanup failed', {
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
  const interval = setIntervalFn(schedule, intervalMs);
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
  cleanupExpiredAccountDeletionRequests,
  startAccountDeletionCleanupScheduler,
};
