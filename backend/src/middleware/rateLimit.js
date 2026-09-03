'use strict';

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function createRateLimit(options = {}) {
  const windowMs = positiveInteger(options.windowMs, 60000);
  const max = positiveInteger(options.max, 3);
  const now = options.now || Date.now;
  const keyGenerator = options.keyGenerator
    || (req => req.user?.id || req.ip || 'anonymous');
  const maxBuckets = positiveInteger(options.maxBuckets, 10000);
  const message = options.message || 'AI 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.';
  const buckets = new Map();
  let requestsSinceCleanup = 0;

  function cleanup(currentTime) {
    for (const [key, bucket] of buckets) {
      if (currentTime >= bucket.resetAt) buckets.delete(key);
    }
    while (buckets.size >= maxBuckets) {
      buckets.delete(buckets.keys().next().value);
    }
  }

  return function rateLimit(req, res, next) {
    const key = String(keyGenerator(req));
    const currentTime = now();
    requestsSinceCleanup += 1;
    if (requestsSinceCleanup >= 100 || buckets.size >= maxBuckets) {
      cleanup(currentTime);
      requestsSinceCleanup = 0;
    }
    const previous = buckets.get(key);
    const bucket = !previous || currentTime >= previous.resetAt
      ? { count: 0, resetAt: currentTime + windowMs }
      : previous;
    bucket.count += 1;
    buckets.set(key, bucket);

    if (bucket.count > max) {
      res.set?.('Retry-After', String(Math.max(1, Math.ceil((bucket.resetAt - currentTime) / 1000))));
      return res.status(429).json({ message });
    }
    return next();
  };
}

module.exports = { createRateLimit };
