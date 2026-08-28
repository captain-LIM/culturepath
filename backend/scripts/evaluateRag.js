'use strict';

require('dotenv').config({ quiet: true });

const fs = require('node:fs');
const path = require('node:path');
const { createRagSearchService } = require('../src/services/ragSearchService');
const { runRagEvaluation } = require('../src/services/ragEvaluationService');

const MOCK_DATASET_PATH = path.join(
  __dirname,
  '..',
  'test',
  'fixtures',
  'rag-evaluation-v1.json',
);
const LIVE_DATASET_PATH = path.join(
  __dirname,
  '..',
  'test',
  'fixtures',
  'rag-evaluation-live-v1.json',
);
// 기존 import 호환성은 유지하되 기본 경로는 명시적으로 Mock이다.
const DATASET_PATH = MOCK_DATASET_PATH;

function parsePositive(value, name, maximum) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new TypeError(`${name}는 1 이상 ${maximum} 이하의 정수여야 합니다.`);
  }
  return parsed;
}

function parseArgs(argv) {
  const result = { help: false, limit: null, live: false };
  for (const argument of argv) {
    if (argument === '--live') result.live = true;
    else if (argument === '--help' || argument === '-h') result.help = true;
    else if (argument.startsWith('--limit=')) {
      result.limit = parsePositive(argument.slice('--limit='.length), 'limit', 1000);
    } else {
      throw new TypeError('지원하지 않는 인자입니다.');
    }
  }
  return result;
}

function validateLiveConfiguration(env, live) {
  if (!live) return;
  const required = [
    'DB_HOST', 'DB_USER', 'DB_NAME',
    'OPENROUTER_API_KEY', 'QDRANT_URL',
  ];
  const missing = required.filter(name => !String(env[name] || '').trim());
  if (missing.length) {
    throw new TypeError(`live RAG 평가 설정이 부족합니다: ${missing.join(', ')}`);
  }
}

function usage() {
  return [
    'Usage: npm run rag:evaluate -- [options]',
    '',
    '  기본 실행           Mock 문서로 고정 평가 세트와 평가기를 검증합니다.',
    '  --live              실제 OpenRouter, Qdrant와 MySQL 원본을 사용합니다.',
    '  --limit=N           처음 N개 case만 실행합니다. 제한 실행은 최종 합격으로 판정하지 않습니다.',
    '  --help, -h          도움말을 표시합니다.',
  ].join('\n');
}

function safeFailure(error) {
  const code = typeof error?.code === 'string' ? error.code : null;
  if (code) return `RAG 검색 평가 실패 (${code})`;
  if (error instanceof TypeError) return `RAG 검색 평가 설정 오류: ${error.message}`;
  return 'RAG 검색 평가 중 오류가 발생했습니다.';
}

function loadDataset(mode = 'mock') {
  const datasetPath = mode === 'live' ? LIVE_DATASET_PATH : MOCK_DATASET_PATH;
  return JSON.parse(fs.readFileSync(datasetPath, 'utf8'));
}

function evaluationExitCode(result) {
  if (!result) return 0;
  if (Number(result.metrics?.errorCount || 0) > 0) return 1;
  return result.complete && !result.passed ? 1 : 0;
}

async function main(argv = process.argv.slice(2), dependencies = {}) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(`${usage()}\n`);
    return null;
  }
  const sourceEnv = dependencies.env || process.env;
  validateLiveConfiguration(sourceEnv, args.live);
  const env = { ...sourceEnv, USE_MOCK_RAG: args.live ? 'false' : 'true' };
  const service = dependencies.searchService || createRagSearchService();
  const mode = args.live ? 'live' : 'mock';
  const result = await runRagEvaluation({
    dataset: dependencies.dataset || loadDataset(mode),
    limit: args.limit,
    mode,
    search: (query, input) => service.search(query, input, { env }),
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result;
}

if (require.main === module) {
  main().then(result => {
    process.exitCode = evaluationExitCode(result);
  }).catch(error => {
    process.stderr.write(`${safeFailure(error)}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  DATASET_PATH,
  LIVE_DATASET_PATH,
  MOCK_DATASET_PATH,
  evaluationExitCode,
  loadDataset,
  main,
  parseArgs,
  safeFailure,
  usage,
  validateLiveConfiguration,
};
