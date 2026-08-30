'use strict';

require('dotenv').config({ quiet: true });

// 지금까지는 사용자가 특정 (장소, 언어) 조합을 처음 조회하는 순간에만
// LLM 번역이 실시간으로 실행됐다 — 그 요청 하나가 재시도까지 실패를
// 반복하며 지연되거나, 트래픽이 몰리는 시점에 비용이 몰리는 문제가
// 있었다. 이 스크립트는 이미 국문 상세가 캐시된(=한 번이라도 조회된)
// 장소들을 훑어 en/ja/zh 번역을 미리 채워 둔다 — 실제 사용자는 대부분
// 캐시 HIT을 받게 되고, 실시간 LLM 호출은 새로 등장하는 장소로 한정된다.
//
// 운영에서 이 스크립트를 사람이 직접 돌리거나 크론으로 예약해 두면
// (예: 매일 새벽) 이 목적을 달성한다. 리포에는 그 스케줄링 설정까지는
// 없다 — 배포 환경마다 크론 방식이 달라 여기서 강제하지 않는다.
const cachedPlacesService = require('../src/services/cachedPlacesService');
const placeCacheRepository = require('../src/repositories/placeCacheRepository');

const SUPPORTED_LANGS = Object.freeze(['en', 'ja', 'zh']);
const DEFAULT_PAGE_SIZE = 200;
const DEFAULT_DELAY_MS = 150;

function parsePositiveInt(value, name, maximum) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new TypeError(`${name}는 1 이상 ${maximum} 이하의 정수여야 합니다.`);
  }
  return parsed;
}

// delay-ms만 0을 허용한다(테스트에서 대기 없이 빠르게 돌리기 위함) —
// limit·batch-size 등 나머지는 0이 의미가 없어 parsePositiveInt를 그대로 쓴다.
function parseNonNegativeInt(value, name, maximum) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > maximum) {
    throw new TypeError(`${name}는 0 이상 ${maximum} 이하의 정수여야 합니다.`);
  }
  return parsed;
}

function parseArgs(argv) {
  const result = {
    dryRun: false,
    help: false,
    limit: null,
    delayMs: DEFAULT_DELAY_MS,
    langs: SUPPORTED_LANGS,
  };
  for (const argument of argv) {
    if (argument === '--dry-run') result.dryRun = true;
    else if (argument === '--help' || argument === '-h') result.help = true;
    else if (argument.startsWith('--limit=')) {
      result.limit = parsePositiveInt(argument.slice('--limit='.length), 'limit', 1_000_000);
    } else if (argument.startsWith('--delay-ms=')) {
      result.delayMs = parseNonNegativeInt(argument.slice('--delay-ms='.length), 'delay-ms', 60_000);
    } else if (argument.startsWith('--langs=')) {
      const requested = argument.slice('--langs='.length).split(',').map(s => s.trim()).filter(Boolean);
      const invalid = requested.filter(lang => !SUPPORTED_LANGS.includes(lang));
      if (invalid.length > 0) {
        throw new TypeError(`지원하지 않는 언어입니다: ${invalid.join(', ')}`);
      }
      if (requested.length === 0) {
        throw new TypeError('--langs에 최소 하나의 언어가 필요합니다.');
      }
      result.langs = requested;
    } else {
      throw new TypeError(`지원하지 않는 인자입니다: ${argument}`);
    }
  }
  return result;
}

function usage() {
  return [
    'Usage: npm run translations:prewarm -- [options]',
    '',
    '이미 국문 상세가 캐시된 장소들을 훑어 en/ja/zh 번역을 미리 채운다.',
    '이미 신선한 번역이 있는 (장소, 언어) 조합은 건너뛴다.',
    '',
    '  --dry-run          실제 LLM 호출·쓰기 없이 대상 개수만 센다.',
    '  --limit=N          최대 N개 장소만 처리한다.',
    '  --langs=en,ja      기본값은 en,ja,zh 전부.',
    '  --delay-ms=N       장소 사이 대기 시간(ms). 기본 150 — 공공데이터/LLM',
    '                     레이트리밋을 피하기 위함.',
    '  --help, -h         도움말을 표시한다.',
  ].join('\n');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function* iterateCachedPlaces(repository, limit) {
  let cursor = null;
  let yielded = 0;
  while (true) {
    const remaining = limit === null ? DEFAULT_PAGE_SIZE : Math.min(DEFAULT_PAGE_SIZE, limit - yielded);
    if (remaining <= 0) return;
    const page = await repository.listPlacesPage({ afterContentId: cursor, limit: remaining });
    for (const place of page.items) {
      if (!place.detail) continue; // 국문 상세를 아직 조회한 적 없는 장소는 건너뛴다.
      yield place;
      yielded += 1;
      if (limit !== null && yielded >= limit) return;
    }
    if (!page.nextCursor) return;
    cursor = page.nextCursor;
  }
}

async function main(argv = process.argv.slice(2), dependencies = {}) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(`${usage()}\n`);
    return null;
  }

  const repository = dependencies.repository || placeCacheRepository;
  const places = dependencies.placesService || cachedPlacesService;
  const logger = dependencies.logger || console;

  // getPlaceDetail이 돌려주는 cacheStatus는 못 믿는다 — 국문 상세와
  // 번역 상세가 각각 따로 캐시되는데, 그 필드는 국문 쪽 캐시 상태를
  // 반환한다(cachedPlacesService.js의 getPlaceDetail 참고: 마지막에
  // `cacheStatus: korResult.cacheStatus`로 국문 결과의 상태를 그대로
  // 씀). 이 스크립트가 다루는 장소는 전부 국문이 이미 캐시돼 있으므로
  // (아니면애초에 iterateCachedPlaces에서 걸러졌다) cacheStatus는 번역
  // 여부와 무관하게 거의 항상 'HIT'로 나온다 — 실측으로 확인했다. 그래서
  // 번역이 실제로 저장됐는지는 항상 DB를 직접 읽어 확인한다: 호출 전에
  // 이미 캐시돼 있으면 호출 자체를 생략하고(비용 절약), 호출 후에는
  // 다시 읽어 실제로 저장됐는지 검증한다(재시도를 다 쓰고도 실패하면
  // cacheable:false로 표시돼 아무것도 저장되지 않을 수 있다).
  const summary = { scanned: 0, warmed: 0, skipped: 0, unstable: 0, failed: 0 };
  for await (const place of iterateCachedPlaces(repository, args.limit)) {
    summary.scanned += 1;
    for (const lang of args.langs) {
      if (args.dryRun) {
        summary.skipped += 1;
        continue;
      }
      try {
        const before = await repository.findPlace(place.contentId);
        if (before?.translations?.[lang]?.cachedAt != null) {
          summary.skipped += 1;
          continue;
        }
        await places.getPlaceDetail({ contentId: place.contentId, lang });
        const after = await repository.findPlace(place.contentId);
        if (after?.translations?.[lang]?.cachedAt != null) {
          summary.warmed += 1;
        } else {
          // LLM이 이번엔 재시도를 다 쓰고도 실패해 캐시에 못 남긴
          // 경우다 — 다음 사전 워밍 실행(또는 실제 사용자 조회)에서
          // 다시 시도될 것이다. 스크립트 자체의 오류가 아니므로 failed와
          // 구분한다.
          summary.unstable += 1;
          logger?.warn?.('번역이 불완전해 이번엔 캐시에 저장되지 않았습니다 — 다음 실행에서 재시도됩니다.', {
            contentId: place.contentId,
            lang,
          });
        }
      } catch (error) {
        summary.failed += 1;
        logger?.warn?.('사전 번역 워밍 실패', {
          contentId: place.contentId,
          lang,
          errorName: error?.name || 'Error',
        });
      }
      if (args.delayMs > 0) await sleep(args.delayMs);
    }
  }

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  return summary;
}

if (require.main === module) {
  // mysql2 커넥션 풀은 열려 있는 동안 이벤트 루프를 계속 붙잡아 둔다 —
  // CLI로 직접 실행할 때는 끝나고 나서 풀을 명시적으로 닫아야 프로세스가
  // 종료된다. 테스트에서 main()을 직접 불러 쓸 때는 이 블록을 타지
  // 않으므로 주입한 fake repository와 무관하게 안전하다.
  main()
    .catch(error => {
      process.stderr.write(`사전 번역 워밍 중 오류가 발생했습니다: ${error?.message || error}\n`);
      process.exitCode = 1;
    })
    .finally(() => {
      require('../src/config/db').end().catch(() => {});
    });
}

module.exports = { main, parseArgs, usage };
