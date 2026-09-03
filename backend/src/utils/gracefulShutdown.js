'use strict';

const { safeErrorCode } = require('./safeErrorCode');

async function closeHttpServer(server) {
  let idleCloseError = null;
  const closed = new Promise((resolve, reject) => {
    try {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    } catch (error) {
      reject(error);
    }
  });

  try {
    server.closeIdleConnections?.();
  } catch (error) {
    idleCloseError = error;
  }

  await closed;
  if (idleCloseError) throw idleCloseError;
}

function safeShutdownLog(logger, signal, failures) {
  try {
    logger.error('Graceful shutdown completed with errors', {
      signal,
      codes: failures.map(safeErrorCode),
    });
  } catch {
    // Shutdown must continue even when the logger is unavailable.
  }
}

function createGracefulShutdown(options = {}) {
  const server = options.server;
  const database = options.pool;
  const logger = options.logger || console;
  const processRef = options.processRef || process;
  const backgroundJobs = (options.backgroundJobs || []).filter(Boolean);
  let shutdownPromise = null;

  return function shutdown(signal = 'SIGTERM') {
    if (shutdownPromise) return shutdownPromise;

    shutdownPromise = (async () => {
      const closing = [
        closeHttpServer(server),
        ...backgroundJobs.map(job => Promise.resolve().then(() => job.stop())),
      ];
      const results = await Promise.allSettled(closing);
      const failures = results
        .filter(result => result.status === 'rejected')
        .map(result => result.reason);

      try {
        await database.end();
      } catch (error) {
        failures.push(error);
      }

      if (failures.length > 0) {
        processRef.exitCode = 1;
        safeShutdownLog(logger, signal, failures);
        throw new Error('GRACEFUL_SHUTDOWN_FAILED');
      }
    })();

    return shutdownPromise;
  };
}

module.exports = {
  closeHttpServer,
  createGracefulShutdown,
};
