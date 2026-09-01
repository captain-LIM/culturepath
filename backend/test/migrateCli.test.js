'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  parseArgs,
  usage,
  checksum,
  computePlan,
  listMigrationFiles,
  migrationConnectionConfig,
  safeFailure,
  MIGRATION_FILE_PATTERN,
} = require('../scripts/migrate');

test('parses explicit runner options and rejects unknown or conflicting ones', () => {
  assert.deepEqual(parseArgs([]), {
    dryRun: false,
    list: false,
    baseline: false,
    strict: false,
    help: false,
  });
  assert.equal(parseArgs(['--dry-run']).dryRun, true);
  assert.equal(parseArgs(['--list']).list, true);
  assert.equal(parseArgs(['--baseline']).baseline, true);
  assert.equal(parseArgs(['--strict']).strict, true);
  assert.equal(parseArgs(['-h']).help, true);
  assert.throws(() => parseArgs(['--unknown']), /지원하지 않는/);
  assert.throws(() => parseArgs(['--baseline', '--dry-run']), /함께 쓸 수 없/);
  assert.match(usage(), /--baseline/);
});

test('checksum is stable and content-sensitive', () => {
  assert.equal(checksum('SELECT 1;'), checksum('SELECT 1;'));
  assert.notEqual(checksum('SELECT 1;'), checksum('SELECT 2;'));
  assert.match(checksum('x'), /^[0-9a-f]{64}$/);
});

test('migration filename pattern matches the repo convention only', () => {
  assert.ok(MIGRATION_FILE_PATTERN.test('20260827_add_course_revision.sql'));
  assert.ok(!MIGRATION_FILE_PATTERN.test('README.md'));
  assert.ok(!MIGRATION_FILE_PATTERN.test('schema.sql'));
  assert.ok(!MIGRATION_FILE_PATTERN.test('2026_add.sql'));
  assert.ok(!MIGRATION_FILE_PATTERN.test('20260827_Add_Course.sql'));
});

test('lists on-disk migrations sorted, without README', () => {
  const files = listMigrationFiles();
  assert.ok(files.length >= 1);
  assert.deepEqual(files, [...files].sort());
  assert.ok(files.every(name => MIGRATION_FILE_PATTERN.test(name)));
  assert.ok(files.includes('20260827_add_course_revision.sql'));
});

test('computePlan separates pending, modified, and missing migrations', () => {
  const files = [
    { filename: '20260101_a.sql', checksum: 'aaa' },
    { filename: '20260102_b.sql', checksum: 'bbb' },
    { filename: '20260103_c.sql', checksum: 'ccc' },
  ];
  const applied = [
    { filename: '20260101_a.sql', checksum: 'aaa' },
    { filename: '20260102_b.sql', checksum: 'OLD' },
    { filename: '20259999_gone.sql', checksum: 'zzz' },
  ];

  const plan = computePlan({ files, applied });
  assert.deepEqual(plan.pending, ['20260103_c.sql']);
  assert.deepEqual(plan.modified, [
    { filename: '20260102_b.sql', expected: 'OLD', actual: 'bbb' },
  ]);
  assert.deepEqual(plan.missing, ['20259999_gone.sql']);
});

test('computePlan treats an empty ledger as everything pending', () => {
  const files = [
    { filename: '20260101_a.sql', checksum: 'aaa' },
    { filename: '20260102_b.sql', checksum: 'bbb' },
  ];
  const plan = computePlan({ files, applied: [] });
  assert.deepEqual(plan.pending, ['20260101_a.sql', '20260102_b.sql']);
  assert.equal(plan.modified.length, 0);
  assert.equal(plan.missing.length, 0);
});

test('migration connection prefers a dedicated schema-change account', () => {
  const base = {
    DB_HOST: 'db.internal',
    DB_PORT: '3307',
    DB_NAME: 'culturepath',
    DB_USER: 'backend',
    DB_PASSWORD: 'backend-pw',
  };
  assert.deepEqual(migrationConnectionConfig(base), {
    host: 'db.internal',
    port: 3307,
    user: 'backend',
    password: 'backend-pw',
    database: 'culturepath',
    charset: 'utf8mb4',
    multipleStatements: true,
  });

  const withMigrator = migrationConnectionConfig({
    ...base,
    DB_MIGRATION_USER: 'migrator',
    DB_MIGRATION_PASSWORD: 'migrator-pw',
  });
  assert.equal(withMigrator.user, 'migrator');
  assert.equal(withMigrator.password, 'migrator-pw');
});

test('safeFailure keeps the SQL reason but strips URIs and credentials', () => {
  const error = new Error('connect to mysql://root:hunter2@db.internal:3306 failed');
  error.code = 'ER_ACCESS_DENIED_ERROR';
  const message = safeFailure(error);
  assert.match(message, /ER_ACCESS_DENIED_ERROR/);
  assert.doesNotMatch(message, /hunter2/);
  assert.doesNotMatch(message, /mysql:\/\//);

  const sqlError = { sqlMessage: "Unknown column 'x' in 'field list'", code: 'ER_BAD_FIELD_ERROR' };
  assert.match(safeFailure(sqlError), /Unknown column 'x'/);
});

test('every on-disk migration uses an advisory lock (idempotent apply contract)', () => {
  for (const name of listMigrationFiles()) {
    const sql = fs.readFileSync(
      path.join(__dirname, '..', 'migrations', name),
      'utf8',
    );
    assert.match(sql, /GET_LOCK\(/, `${name} must acquire an advisory lock`);
    assert.match(sql, /RELEASE_LOCK\(/, `${name} must release its advisory lock`);
  }
});
