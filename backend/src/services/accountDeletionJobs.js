'use strict';

const pool = require('../config/db');
const { createAccountDeletionMailer } = require('./accountDeletionEmailService');
const { startAccountDeletionEmailWorker } = require('./accountDeletionEmailWorker');
const {
  startAccountDeletionCleanupScheduler,
} = require('./accountDeletionCleanupService');

function startAccountDeletionJobs(options = {}) {
  const config = options.config;
  const database = options.pool || pool;
  const startCleanup = options.startCleanup || startAccountDeletionCleanupScheduler;
  const startEmailWorker = options.startEmailWorker || startAccountDeletionEmailWorker;
  const createMailer = options.createMailer || createAccountDeletionMailer;

  const cleanupScheduler = startCleanup({
    pool: database,
    intervalMs: config.cleanupIntervalMs,
    logger: options.logger,
  });
  const emailWorker = config.enabled
    ? startEmailWorker({
      config,
      pool: database,
      mailer: createMailer(config),
      logger: options.logger,
    })
    : null;

  return { emailWorker, cleanupScheduler };
}

module.exports = { startAccountDeletionJobs };
