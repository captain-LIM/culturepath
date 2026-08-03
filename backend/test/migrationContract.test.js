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
