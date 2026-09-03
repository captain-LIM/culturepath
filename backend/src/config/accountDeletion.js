'use strict';

const DEFAULTS = Object.freeze({
  tokenTtlSeconds: 1800,
  resendCooldownSeconds: 600,
  maxSendsPerDay: 3,
  rateLimitWindowMs: 900000,
  rateLimitMaxRequests: 5,
  confirmRateLimitWindowMs: 900000,
  confirmRateLimitMaxRequests: 10,
  minimumResponseMs: 600,
  workerPollMs: 5000,
  workerBatchSize: 10,
  workerLeaseSeconds: 60,
  emailMaxAttempts: 3,
  cleanupIntervalMs: 300000,
});

const UPPER_LIMITS = Object.freeze({
  workerPollMs: 3_600_000,
  workerBatchSize: 100,
  workerLeaseSeconds: 3_600,
  emailMaxAttempts: 10,
  cleanupIntervalMs: 86_400_000,
});

const UNSAFE_TOKEN_SECRETS = new Set([
  'replace_with_at_least_32_random_bytes',
]);

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function boundedPositiveInteger(value, fallback, maximum) {
  const parsed = positiveInteger(value, fallback);
  return parsed <= maximum ? parsed : fallback;
}

function enabled(value) {
  return String(value || '').trim().toLowerCase() === 'true';
}

function readAccountDeletionConfig(env = process.env) {
  return {
    enabled: enabled(env.ACCOUNT_DELETION_WEB_FORM_ENABLED),
    publicBaseUrl: String(env.ACCOUNT_DELETION_PUBLIC_BASE_URL || '').trim(),
    tokenTtlSeconds: positiveInteger(
      env.ACCOUNT_DELETION_TOKEN_TTL_SECONDS,
      DEFAULTS.tokenTtlSeconds,
    ),
    resendCooldownSeconds: positiveInteger(
      env.ACCOUNT_DELETION_RESEND_COOLDOWN_SECONDS,
      DEFAULTS.resendCooldownSeconds,
    ),
    maxSendsPerDay: positiveInteger(
      env.ACCOUNT_DELETION_MAX_SENDS_PER_DAY,
      DEFAULTS.maxSendsPerDay,
    ),
    rateLimitWindowMs: positiveInteger(
      env.ACCOUNT_DELETION_RATE_LIMIT_WINDOW_MS,
      DEFAULTS.rateLimitWindowMs,
    ),
    rateLimitMaxRequests: positiveInteger(
      env.ACCOUNT_DELETION_RATE_LIMIT_MAX_REQUESTS,
      DEFAULTS.rateLimitMaxRequests,
    ),
    confirmRateLimitWindowMs: positiveInteger(
      env.ACCOUNT_DELETION_CONFIRM_RATE_LIMIT_WINDOW_MS,
      DEFAULTS.confirmRateLimitWindowMs,
    ),
    confirmRateLimitMaxRequests: positiveInteger(
      env.ACCOUNT_DELETION_CONFIRM_RATE_LIMIT_MAX_REQUESTS,
      DEFAULTS.confirmRateLimitMaxRequests,
    ),
    minimumResponseMs: positiveInteger(
      env.ACCOUNT_DELETION_MINIMUM_RESPONSE_MS,
      DEFAULTS.minimumResponseMs,
    ),
    tokenSecret: String(env.ACCOUNT_DELETION_TOKEN_SECRET || ''),
    workerPollMs: boundedPositiveInteger(
      env.ACCOUNT_DELETION_WORKER_POLL_MS,
      DEFAULTS.workerPollMs,
      UPPER_LIMITS.workerPollMs,
    ),
    workerBatchSize: boundedPositiveInteger(
      env.ACCOUNT_DELETION_WORKER_BATCH_SIZE,
      DEFAULTS.workerBatchSize,
      UPPER_LIMITS.workerBatchSize,
    ),
    workerLeaseSeconds: boundedPositiveInteger(
      env.ACCOUNT_DELETION_WORKER_LEASE_SECONDS,
      DEFAULTS.workerLeaseSeconds,
      UPPER_LIMITS.workerLeaseSeconds,
    ),
    emailMaxAttempts: boundedPositiveInteger(
      env.ACCOUNT_DELETION_EMAIL_MAX_ATTEMPTS,
      DEFAULTS.emailMaxAttempts,
      UPPER_LIMITS.emailMaxAttempts,
    ),
    cleanupIntervalMs: boundedPositiveInteger(
      env.ACCOUNT_DELETION_CLEANUP_INTERVAL_MS,
      DEFAULTS.cleanupIntervalMs,
      UPPER_LIMITS.cleanupIntervalMs,
    ),
    smtp: {
      host: String(env.ACCOUNT_DELETION_SMTP_HOST || '').trim(),
      port: positiveInteger(env.ACCOUNT_DELETION_SMTP_PORT, 587),
      secure: enabled(env.ACCOUNT_DELETION_SMTP_SECURE),
      user: String(env.ACCOUNT_DELETION_SMTP_USER || '').trim(),
      password: String(env.ACCOUNT_DELETION_SMTP_PASSWORD || ''),
      from: String(env.ACCOUNT_DELETION_EMAIL_FROM || '').trim(),
    },
  };
}

function validateAccountDeletionConfig(config, options = {}) {
  const production = options.production ?? process.env.NODE_ENV === 'production';
  if (!config.enabled) return [];

  const errors = [];
  let baseUrl;
  try {
    baseUrl = new URL(config.publicBaseUrl);
  } catch {
    errors.push('ACCOUNT_DELETION_PUBLIC_BASE_URL must be an absolute URL');
  }
  if (baseUrl && production && baseUrl.protocol !== 'https:') {
    errors.push('ACCOUNT_DELETION_PUBLIC_BASE_URL must use HTTPS in production');
  }
  const trimmedTokenSecret = String(config.tokenSecret || '').trim();
  if (
    Buffer.byteLength(trimmedTokenSecret, 'utf8') < 32
    || UNSAFE_TOKEN_SECRETS.has(trimmedTokenSecret)
  ) {
    errors.push(
      'ACCOUNT_DELETION_TOKEN_SECRET must be a non-placeholder value of at least 32 bytes',
    );
  }
  for (const [name, value] of [
    ['ACCOUNT_DELETION_SMTP_HOST', config.smtp.host],
    ['ACCOUNT_DELETION_SMTP_USER', config.smtp.user],
    ['ACCOUNT_DELETION_SMTP_PASSWORD', config.smtp.password],
    ['ACCOUNT_DELETION_EMAIL_FROM', config.smtp.from],
  ]) {
    if (!value) errors.push(`${name} is required when the web form is enabled`);
  }
  return errors;
}

module.exports = {
  DEFAULTS,
  UPPER_LIMITS,
  UNSAFE_TOKEN_SECRETS,
  readAccountDeletionConfig,
  validateAccountDeletionConfig,
};
