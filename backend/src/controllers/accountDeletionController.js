'use strict';

const {
  requestAccountDeletion,
  confirmAccountDeletion,
} = require('../services/accountDeletionRequestService');
const { safeErrorCode } = require('../utils/safeErrorCode');

const ACCEPTED_MESSAGE = 'If the account exists, a confirmation email is being sent.';
const INVALID_CONFIRMATION_MESSAGE = 'The confirmation link is invalid or expired.';

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createAccountDeletionController(options = {}) {
  const config = options.config;
  const requestDeletion = options.requestDeletion || requestAccountDeletion;
  const confirmDeletion = options.confirmDeletion || confirmAccountDeletion;
  const clock = options.clock || Date.now;
  const delay = options.delay || wait;
  const logger = options.logger || console;

  async function padResponse(startedAt) {
    const remaining = Math.max(0, Number(config.minimumResponseMs || 0) - (clock() - startedAt));
    if (remaining > 0) await delay(remaining);
  }

  async function request(req, res) {
    const startedAt = clock();
    if (!config.enabled) {
      return res.status(503).json({ message: 'Account deletion web requests are unavailable.' });
    }
    if (req.body.website) {
      await padResponse(startedAt);
      return res.status(202).json({ accepted: true, message: ACCEPTED_MESSAGE });
    }

    try {
      await requestDeletion(req.body.email, req.body.locale, { config });
      await padResponse(startedAt);
      return res.status(202).json({ accepted: true, message: ACCEPTED_MESSAGE });
    } catch (error) {
      logger.error('Account deletion request failed', {
        code: safeErrorCode(error),
      });
      await padResponse(startedAt);
      return res.status(503).json({ message: 'Account deletion requests are temporarily unavailable.' });
    }
  }

  async function confirm(req, res) {
    if (!config.enabled) {
      return res.status(503).json({ message: 'Account deletion web requests are unavailable.' });
    }
    try {
      const result = await confirmDeletion(req.body.token);
      if (!result.deleted) {
        return res.status(400).json({ message: INVALID_CONFIRMATION_MESSAGE });
      }
      return res.json({ deleted: true, message: 'Your account has been deleted.' });
    } catch (error) {
      logger.error('Account deletion confirmation failed', {
        code: safeErrorCode(error),
      });
      return res.status(503).json({ message: 'Account deletion is temporarily unavailable.' });
    }
  }

  return { request, confirm };
}

module.exports = {
  ACCEPTED_MESSAGE,
  INVALID_CONFIRMATION_MESSAGE,
  createAccountDeletionController,
};
