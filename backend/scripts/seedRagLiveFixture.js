'use strict';

require('dotenv').config({ quiet: true });

const pool = require('../src/config/db');
const placeCacheRepository = require('../src/repositories/placeCacheRepository');
const cachedPlacesService = require('../src/services/cachedPlacesService');
const { seedRagLiveFixture } = require('../src/services/ragLiveFixtureSeedService');
const { loadDataset } = require('./evaluateRag');

function parseArgs(argv) {
  const args = { help: false, live: false };
  for (const argument of argv) {
    if (argument === '--live') args.live = true;
    else if (argument === '--help' || argument === '-h') args.help = true;
    else throw new TypeError('지원하지 않는 인자입니다.');
  }
  if (!args.help && !args.live) {
    throw new TypeError('실제 TourAPI·MySQL 적재에는 --live를 명시해야 합니다.');
  }
  return args;
}

function usage() {
  return [
    'Usage: npm run rag:seed-live-fixture -- --live',
    '',
    '  --live     fixture에서 누락된 contentId만 TourAPI 상세조회 후 MySQL에 저장합니다.',
    '  --help     외부 호출이나 DB 쓰기 없이 도움말을 표시합니다.',
  ].join('\n');
}

function validateRuntimeConfiguration(env) {
  if (!String(env.TOUR_API_KEY || '').trim()) {
    throw new TypeError('TOUR_API_KEY가 필요합니다.');
  }
  for (const name of ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME']) {
    if (!String(env[name] || '').trim()) {
      throw new TypeError(`${name}가 필요합니다.`);
    }
  }
}

function safeFailure(error) {
  const code = typeof error?.code === 'string' ? error.code : null;
  if (code) return `live RAG fixture 적재 실패 (${code})`;
  if (error instanceof TypeError) return `live RAG fixture 적재 설정 오류: ${error.message}`;
  return 'live RAG fixture 적재 중 오류가 발생했습니다.';
}

async function main(argv = process.argv.slice(2), dependencies = {}) {
  const args = parseArgs(argv);
  const stdout = dependencies.stdout || process.stdout;
  if (args.help) {
    stdout.write(`${usage()}\n`);
    return { help: true };
  }
  validateRuntimeConfiguration(dependencies.env || process.env);

  const repository = dependencies.repository || placeCacheRepository;
  const placesService = dependencies.placesService || cachedPlacesService;
  const close = dependencies.close ||
    (!dependencies.repository || !dependencies.placesService ? () => pool.end() : null);
  try {
    const result = await seedRagLiveFixture({
      dataset: dependencies.dataset || loadDataset('live'),
      fetchAndCachePlace: contentId => placesService.getPlaceDetail({ contentId }),
      findExistingPlaces: contentIds => repository.findExistingPlaces(contentIds),
      updatePlaceCultures: input => repository.updatePlaceCultures(input),
    });
    stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return result;
  } finally {
    if (close) await close();
  }
}

if (require.main === module) {
  main().then(result => {
    process.exitCode = result?.help || result?.readyForEvidenceReview ? 0 : 1;
  }).catch(error => {
    process.stderr.write(`${safeFailure(error)}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  main,
  parseArgs,
  safeFailure,
  usage,
  validateRuntimeConfiguration,
};
