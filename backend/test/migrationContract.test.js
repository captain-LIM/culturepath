'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

test('defines idempotency keys with case-sensitive ASCII collation', () => {
  const schema = read('schema.sql');
  const migration = read('migrations/20260803_add_course_idempotency.sql');

  assert.match(
    schema,
    /idempotency_key\s+VARCHAR\(64\) CHARACTER SET ascii COLLATE ascii_bin/,
  );
  assert.match(
    migration,
    /MODIFY idempotency_key VARCHAR\(64\) CHARACTER SET ascii COLLATE ascii_bin/,
  );
  assert.match(migration, /UNIQUE KEY uk_course_idempotency \(user_id, idempotency_key\)/);
});

test('defines a repeatable contentId index for public-course place usage', () => {
  const schema = read('schema.sql');
  const migration = read('migrations/20260825_add_course_place_usage_index.sql');

  assert.match(
    schema,
    /INDEX idx_course_tracks_content_course \(content_id, course_id\)/,
  );
  assert.match(migration, /GET_LOCK\(/);
  assert.match(migration, /information_schema\.STATISTICS/);
  assert.match(
    migration,
    /ADD INDEX idx_course_tracks_content_course \(content_id, course_id\)/,
  );
  assert.match(migration, /RELEASE_LOCK\(/);
});
