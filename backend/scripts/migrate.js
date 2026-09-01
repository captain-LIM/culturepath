'use strict';

require('dotenv').config({ quiet: true });

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');
const MIGRATION_FILE_PATTERN = /^\d{8}_[a-z0-9_]+\.sql$/;
// 러너 전체를 감싸는 전역 자문 잠금. 개별 마이그레이션 파일도 자체 GET_LOCK을
// 쓰지만, 두 배포가 "미적용 목록 계산 → 실행" 구간에서 겹치지 않도록 한 겹 더 잠근다.
const RUN_LOCK_NAME = 'culturepath_schema_migrations';
const RUN_LOCK_TIMEOUT_SECONDS = 10;

function parseArgs(argv) {
  const result = {
    dryRun: false,
    list: false,
    baseline: false,
    strict: false,
    help: false,
  };
  for (const argument of argv) {
    if (argument === '--dry-run') result.dryRun = true;
    else if (argument === '--list') result.list = true;
    else if (argument === '--baseline') result.baseline = true;
    else if (argument === '--strict') result.strict = true;
    else if (argument === '--help' || argument === '-h') result.help = true;
    else throw new TypeError(`지원하지 않는 인자입니다: ${argument}`);
  }
  if (result.baseline && result.dryRun) {
    throw new TypeError('--baseline과 --dry-run은 함께 쓸 수 없습니다.');
  }
  return result;
}

function usage() {
  return [
    'Usage: node scripts/migrate.js [options]',
    '',
    'migrations/ 의 *.sql 을 파일명 순서로 적용하고, 적용분을 schema_migrations',
    '테이블에 기록합니다. 이미 기록된 마이그레이션은 건너뜁니다.',
    '',
    '  --list       적용/미적용 상태만 출력합니다. DB를 변경하지 않습니다.',
    '  --dry-run    적용될 마이그레이션 목록만 출력합니다. DB를 변경하지 않습니다.',
    '  --baseline   미적용 마이그레이션을 "실행하지 않고" 적용된 것으로 기록합니다.',
    '               (이미 수동으로 반영된 기존 운영 DB를 러너로 넘길 때 1회 사용)',
    '  --strict     이미 적용된 마이그레이션 파일 내용이 바뀌었으면 실패합니다.',
    '               (기본값: 경고만 출력)',
    '  --help, -h   이 도움말을 표시합니다.',
    '',
    '환경변수: DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD',
    '  스키마 변경 권한(ALTER 등)이 있는 별도 계정이 있으면 DB_MIGRATION_USER,',
    '  DB_MIGRATION_PASSWORD 로 지정하세요. 없으면 DB_USER/DB_PASSWORD 를 씁니다.',
  ].join('\n');
}

function checksum(sqlText) {
  return crypto.createHash('sha256').update(sqlText, 'utf8').digest('hex');
}

/** migrations/ 에서 유효한 마이그레이션 파일명을 정렬해 반환한다. */
function listMigrationFiles(dir = MIGRATIONS_DIR) {
  return fs
    .readdirSync(dir)
    .filter(name => MIGRATION_FILE_PATTERN.test(name))
    .sort();
}

/**
 * 파일 목록과 이미 적용된 레코드를 비교해 실행 계획을 만든다. DB 접근 없이 순수 계산만 한다.
 * @param {{ files: {filename: string, checksum: string}[], applied: {filename: string, checksum: string}[] }} input
 * @returns {{ pending: string[], modified: {filename: string, expected: string, actual: string}[], missing: string[] }}
 */
function computePlan({ files, applied }) {
  const appliedByName = new Map(applied.map(row => [row.filename, row.checksum]));
  const fileNames = new Set(files.map(file => file.filename));

  const pending = [];
  const modified = [];
  for (const file of files) {
    if (!appliedByName.has(file.filename)) {
      pending.push(file.filename);
      continue;
    }
    const recorded = appliedByName.get(file.filename);
    if (recorded && file.checksum && recorded !== file.checksum) {
      modified.push({
        filename: file.filename,
        expected: recorded,
        actual: file.checksum,
      });
    }
  }

  // 기록에는 있는데 파일이 사라진 경우 — 되돌릴 수 없으니 경고만 한다.
  const missing = applied
    .map(row => row.filename)
    .filter(name => !fileNames.has(name));

  return { pending, modified, missing };
}

function safeFailure(error) {
  const raw =
    (error && (error.sqlMessage || error.message)) || '알 수 없는 오류';
  // 접속 문자열이나 자격 증명이 메시지에 섞여도 밖으로 내보내지 않는다.
  const scrubbed = String(raw)
    .replace(/[a-z]+:\/\/[^\s]+/gi, '[uri]')
    .replace(/(password|pwd|pass)\s*[:=]\s*\S+/gi, '$1=[redacted]');
  const code = error && error.code ? ` (${error.code})` : '';
  return `마이그레이션 실패${code}: ${scrubbed}`;
}

// ─── 여기서부터는 DB가 필요한 실행 경로 ──────────────────────────────────────

function migrationConnectionConfig(env = process.env) {
  return {
    host: env.DB_HOST,
    port: env.DB_PORT ? Number(env.DB_PORT) : undefined,
    user: env.DB_MIGRATION_USER || env.DB_USER,
    password: env.DB_MIGRATION_PASSWORD || env.DB_PASSWORD,
    database: env.DB_NAME,
    charset: 'utf8mb4',
    multipleStatements: true,
  };
}

async function ensureMigrationsTable(connection) {
  await connection.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       filename   VARCHAR(255) NOT NULL PRIMARY KEY,
       checksum   CHAR(64) NOT NULL,
       applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
     )`,
  );
}

async function readAppliedMigrations(connection) {
  const [rows] = await connection.query(
    'SELECT filename, checksum FROM schema_migrations',
  );
  return rows;
}

async function acquireRunLock(connection) {
  const [[{ locked }]] = await connection.query(
    'SELECT GET_LOCK(?, ?) AS locked',
    [RUN_LOCK_NAME, RUN_LOCK_TIMEOUT_SECONDS],
  );
  if (locked !== 1) {
    throw new Error(
      '다른 마이그레이션 실행이 진행 중이라 잠금을 얻지 못했습니다.',
    );
  }
}

async function releaseRunLock(connection) {
  try {
    await connection.query('SELECT RELEASE_LOCK(?)', [RUN_LOCK_NAME]);
  } catch {
    // 연결이 이미 끊겼으면 잠금도 자동 해제된다.
  }
}

async function applyMigration(connection, filename) {
  const fullPath = path.join(MIGRATIONS_DIR, filename);
  const sqlText = fs.readFileSync(fullPath, 'utf8');
  await connection.query(sqlText);
  await connection.query(
    'INSERT INTO schema_migrations (filename, checksum) VALUES (?, ?)',
    [filename, checksum(sqlText)],
  );
}

async function recordBaseline(connection, filenames) {
  for (const filename of filenames) {
    const sqlText = fs.readFileSync(
      path.join(MIGRATIONS_DIR, filename),
      'utf8',
    );
    await connection.query(
      `INSERT INTO schema_migrations (filename, checksum) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE checksum = VALUES(checksum)`,
      [filename, checksum(sqlText)],
    );
  }
}

function loadLocalMigrations() {
  return listMigrationFiles().map(filename => ({
    filename,
    checksum: checksum(
      fs.readFileSync(path.join(MIGRATIONS_DIR, filename), 'utf8'),
    ),
  }));
}

async function run(options) {
  const mysql = require('mysql2/promise');
  const files = loadLocalMigrations();

  const connection = await mysql.createConnection(
    migrationConnectionConfig(),
  );
  try {
    await ensureMigrationsTable(connection);
    await acquireRunLock(connection);
    try {
      const applied = await readAppliedMigrations(connection);
      const plan = computePlan({ files, applied });

      for (const name of plan.missing) {
        console.warn(
          `경고: 기록에는 있으나 파일이 없는 마이그레이션 — ${name}`,
        );
      }
      if (plan.modified.length > 0) {
        for (const item of plan.modified) {
          console.warn(
            `경고: 적용 후 내용이 바뀐 마이그레이션 — ${item.filename}`,
          );
        }
        if (options.strict) {
          throw new Error(
            '--strict: 이미 적용된 마이그레이션 파일이 수정되었습니다.',
          );
        }
      }

      if (options.list) {
        const appliedNames = new Set(applied.map(row => row.filename));
        for (const file of files) {
          const mark = appliedNames.has(file.filename) ? '적용됨 ' : '미적용 ';
          console.log(`${mark} ${file.filename}`);
        }
        return;
      }

      if (plan.pending.length === 0) {
        console.log('적용할 마이그레이션이 없습니다.');
        return;
      }

      if (options.dryRun) {
        console.log(`적용 예정 ${plan.pending.length}건:`);
        for (const name of plan.pending) console.log(`  - ${name}`);
        console.log('--dry-run 모드라 DB는 변경하지 않았습니다.');
        return;
      }

      if (options.baseline) {
        await recordBaseline(connection, plan.pending);
        console.log(
          `--baseline: ${plan.pending.length}건을 실행하지 않고 적용된 것으로 기록했습니다.`,
        );
        return;
      }

      for (const name of plan.pending) {
        process.stdout.write(`적용 중: ${name} ... `);
        await applyMigration(connection, name);
        console.log('완료');
      }
      console.log(`마이그레이션 ${plan.pending.length}건을 적용했습니다.`);
    } finally {
      await releaseRunLock(connection);
    }
  } finally {
    await connection.end();
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }
  await run(options);
}

if (require.main === module) {
  main().catch(error => {
    console.error(safeFailure(error));
    process.exit(1);
  });
}

module.exports = {
  parseArgs,
  usage,
  checksum,
  computePlan,
  listMigrationFiles,
  migrationConnectionConfig,
  safeFailure,
  MIGRATION_FILE_PATTERN,
};
