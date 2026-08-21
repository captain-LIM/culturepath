'use strict';

require('dotenv').config({ quiet: true });

const placeCacheRepository = require('../src/repositories/placeCacheRepository');
const pool = require('../src/config/db');
const { auditRagLiveFixture } = require('../src/services/ragLiveFixtureAuditService');
const { loadDataset } = require('./evaluateRag');

function safeFailure(error) {
  const code = typeof error?.code === 'string' ? error.code : null;
  return code
    ? `live RAG fixture 감사 실패 (${code})`
    : 'live RAG fixture 감사 중 오류가 발생했습니다.';
}

async function main(dependencies = {}) {
  const repository = dependencies.repository || placeCacheRepository;
  const close = dependencies.close ||
    (dependencies.repository ? null : () => pool.end());
  const stdout = dependencies.stdout || process.stdout;
  try {
    const result = await auditRagLiveFixture({
      dataset: dependencies.dataset || loadDataset('live'),
      findExistingPlaces: contentIds => repository.findExistingPlaces(contentIds),
    });
    stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return result;
  } finally {
    if (close) await close();
  }
}

if (require.main === module) {
  main().then(result => {
    process.exitCode = result.readyForApproval ? 0 : 1;
  }).catch(error => {
    process.stderr.write(`${safeFailure(error)}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  main,
  safeFailure,
};
