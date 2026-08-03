'use strict';

require('dotenv').config({ quiet: true });

const { getRagIndexConfig } = require('../src/config/ragIndex');
const placeCacheRepository = require('../src/repositories/placeCacheRepository');
const { createOpenRouterClient } = require('../src/services/openRouterClient');
const { createPlaceIndexService } = require('../src/services/placeIndexService');
const { createQdrantClient } = require('../src/services/qdrantClient');

function parsePositiveFlag(value, name, maximum) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new TypeError(`${name}는 1 이상 ${maximum} 이하의 정수여야 합니다.`);
  }
  return parsed;
}

function parseArgs(argv) {
  const result = { batchSize: undefined, dryRun: false, help: false, limit: null, prune: false };
  for (const argument of argv) {
    if (argument === '--dry-run') result.dryRun = true;
    else if (argument === '--prune') result.prune = true;
    else if (argument === '--help' || argument === '-h') result.help = true;
    else if (argument.startsWith('--limit=')) {
      result.limit = parsePositiveFlag(argument.slice('--limit='.length), 'limit', 1_000_000);
    } else if (argument.startsWith('--batch-size=')) {
      result.batchSize = parsePositiveFlag(
        argument.slice('--batch-size='.length),
        'batch-size',
        100,
      );
    } else {
      throw new TypeError('지원하지 않는 인자입니다.');
    }
  }
  return result;
}

function validateRuntimeConfiguration(env, args) {
  if (args.dryRun) return;
  if (!String(env.OPENROUTER_API_KEY || '').trim()) {
    throw new TypeError('OPENROUTER_API_KEY가 필요합니다.');
  }
  if (!String(env.QDRANT_URL || '').trim()) {
    throw new TypeError('QDRANT_URL이 필요합니다.');
  }
}

function usage() {
  return [
    'Usage: npm run rag:index -- [options]',
    '',
    '  --dry-run          MySQL 장소만 읽고 외부 호출과 쓰기를 생략합니다.',
    '  --limit=N          최대 N개 장소만 처리합니다.',
    '  --batch-size=N     임베딩·upsert batch 크기입니다. 기본값은 32입니다.',
    '  --prune            전체 인덱싱 후 MySQL에 없는 장소를 명시적으로 삭제합니다.',
    '  --help, -h         도움말을 표시합니다.',
  ].join('\n');
}

function safeFailure(error) {
  const knownCode = typeof error?.code === 'string' ? error.code : null;
  if (knownCode) return `RAG 장소 인덱싱 실패 (${knownCode})`;
  if (error instanceof TypeError) return `RAG 장소 인덱싱 설정 오류: ${error.message}`;
  return 'RAG 장소 인덱싱 중 오류가 발생했습니다.';
}

async function main(argv = process.argv.slice(2), dependencies = {}) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(`${usage()}\n`);
    return null;
  }
  validateRuntimeConfiguration(process.env, args);

  const config = dependencies.config || getRagIndexConfig(process.env);
  const effectiveEnv = {
    ...process.env,
    OPENROUTER_EMBEDDING_MODEL: config.embeddingModel,
    QDRANT_COLLECTION: config.collection,
  };
  const embeddingClient = dependencies.embeddingClient ||
    createOpenRouterClient({ env: effectiveEnv });
  const qdrantClient = dependencies.qdrantClient ||
    createQdrantClient({ env: effectiveEnv });
  const service = createPlaceIndexService({
    config,
    embeddingClient,
    placeRepository: dependencies.placeRepository || placeCacheRepository,
    qdrantClient,
  });
  const result = await service.run(args);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result;
}

if (require.main === module) {
  main().catch(error => {
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
