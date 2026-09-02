'use strict';

const pool = require('../src/config/db');
const {
  cleanupExpiredAccountDeletionRequests,
  safeErrorCode,
} = require('../src/services/accountDeletionEmailWorker');

async function main(options = {}) {
  const database = options.pool || pool;
  const logger = options.logger || console;
  try {
    const result = await cleanupExpiredAccountDeletionRequests({
      pool: database,
      clock: options.clock,
    });
    logger.log(`Account deletion request cleanup removed ${result.deletedCount} row(s).`);
    return result;
  } catch (error) {
    logger.error(`Account deletion request cleanup failed (${safeErrorCode(error)}).`);
    throw error;
  } finally {
    if (options.closePool !== false) await database.end?.();
  }
}

if (require.main === module) {
  main().catch(() => { process.exitCode = 1; });
}

module.exports = { main };
