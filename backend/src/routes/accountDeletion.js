'use strict';

const express = require('express');
const { body, validationResult } = require('express-validator');
const { createRateLimit } = require('../middleware/rateLimit');
const { resolveClientIp } = require('../middleware/clientIp');
const {
  readAccountDeletionConfig,
  validateAccountDeletionConfig,
} = require('../config/accountDeletion');
const { createAccountDeletionController } = require('../controllers/accountDeletionController');

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ message: 'Invalid request.' });
  return next();
}

function requireSameOrigin(publicBaseUrl) {
  let expectedOrigin = null;
  try {
    expectedOrigin = new URL(publicBaseUrl).origin;
  } catch {
    // Configuration validation reports this when the feature is enabled.
  }
  return function sameOrigin(req, res, next) {
    if (req.get('Sec-Fetch-Site') === 'cross-site') {
      return res.status(403).json({ message: 'Cross-site requests are not allowed.' });
    }
    const origin = req.get('Origin');
    if (origin && expectedOrigin && origin !== expectedOrigin) {
      return res.status(403).json({ message: 'Cross-site requests are not allowed.' });
    }
    return next();
  };
}

function createAccountDeletionRouter(options = {}) {
  const config = options.config || readAccountDeletionConfig();
  const errors = validateAccountDeletionConfig(config, options);
  if (errors.length > 0) {
    throw new Error(`Invalid account deletion web form configuration: ${errors.join('; ')}`);
  }
  const controller = options.controller || createAccountDeletionController({ config });
  const router = express.Router();
  const keyGenerator = options.keyGenerator || (req => resolveClientIp(req));
  const requestLimiter = createRateLimit({
    windowMs: config.rateLimitWindowMs,
    max: config.rateLimitMaxRequests,
    keyGenerator,
    message: 'Too many account deletion requests. Please try again later.',
  });
  const confirmLimiter = createRateLimit({
    windowMs: config.confirmRateLimitWindowMs,
    max: config.confirmRateLimitMaxRequests,
    keyGenerator,
    message: 'Too many account deletion confirmations. Please try again later.',
  });
  const sameOrigin = requireSameOrigin(config.publicBaseUrl);

  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    next();
  });
  router.use(express.json({ limit: '10kb' }));
  router.use(express.urlencoded({ extended: false, limit: '10kb' }));
  router.post(
    '/requests',
    requestLimiter,
    [
      body('email').isEmail().isLength({ max: 254 }),
      body('locale').optional().isIn(['ko', 'en', 'ja', 'zh']),
      body('website').optional().isString().isLength({ max: 200 }),
    ],
    validate,
    controller.request,
  );
  router.post(
    '/confirm',
    sameOrigin,
    confirmLimiter,
    [
      body('token').isString().matches(/^[A-Za-z0-9_-]{43}$/),
      body('confirmation').equals('DELETE'),
    ],
    validate,
    controller.confirm,
  );
  return router;
}

module.exports = {
  createAccountDeletionRouter,
  requireSameOrigin,
};
