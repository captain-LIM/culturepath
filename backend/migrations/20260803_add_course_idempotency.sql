-- Prevent duplicate course creation when a client retries after an ambiguous timeout.
SET @migration_lock_acquired := GET_LOCK(
  'culturepath_20260803_add_course_idempotency',
  10
);

SET @idempotency_column_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'courses'
    AND COLUMN_NAME = 'idempotency_key'
);

SET @add_idempotency_column_sql := IF(
  @migration_lock_acquired = 1,
  IF(
    @idempotency_column_exists = 0,
    'ALTER TABLE courses ADD COLUMN idempotency_key VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL AFTER forked_from_author_id',
    'SELECT 1'
  ),
  'SIGNAL SQLSTATE ''45000'' SET MESSAGE_TEXT = ''Could not acquire migration lock'''
);
PREPARE add_idempotency_column_statement FROM @add_idempotency_column_sql;
EXECUTE add_idempotency_column_statement;
DEALLOCATE PREPARE add_idempotency_column_statement;

SET @idempotency_key_is_binary_ascii := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'courses'
    AND COLUMN_NAME = 'idempotency_key'
    AND CHARACTER_SET_NAME = 'ascii'
    AND COLLATION_NAME = 'ascii_bin'
);
SET @normalize_idempotency_key_sql := IF(
  @idempotency_key_is_binary_ascii = 0,
  'ALTER TABLE courses MODIFY idempotency_key VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL',
  'SELECT 1'
);
PREPARE normalize_idempotency_key_statement FROM @normalize_idempotency_key_sql;
EXECUTE normalize_idempotency_key_statement;
DEALLOCATE PREPARE normalize_idempotency_key_statement;

SET @idempotency_fingerprint_column_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'courses'
    AND COLUMN_NAME = 'idempotency_fingerprint'
);
SET @add_idempotency_fingerprint_column_sql := IF(
  @idempotency_fingerprint_column_exists = 0,
  'ALTER TABLE courses ADD COLUMN idempotency_fingerprint CHAR(64) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL AFTER idempotency_key',
  'SELECT 1'
);
PREPARE add_idempotency_fingerprint_column_statement FROM @add_idempotency_fingerprint_column_sql;
EXECUTE add_idempotency_fingerprint_column_statement;
DEALLOCATE PREPARE add_idempotency_fingerprint_column_statement;

SET @idempotency_fingerprint_is_binary_ascii := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'courses'
    AND COLUMN_NAME = 'idempotency_fingerprint'
    AND CHARACTER_SET_NAME = 'ascii'
    AND COLLATION_NAME = 'ascii_bin'
);
SET @normalize_idempotency_fingerprint_sql := IF(
  @idempotency_fingerprint_is_binary_ascii = 0,
  'ALTER TABLE courses MODIFY idempotency_fingerprint CHAR(64) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL',
  'SELECT 1'
);
PREPARE normalize_idempotency_fingerprint_statement FROM @normalize_idempotency_fingerprint_sql;
EXECUTE normalize_idempotency_fingerprint_statement;
DEALLOCATE PREPARE normalize_idempotency_fingerprint_statement;

SET @idempotency_index_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'courses'
    AND INDEX_NAME = 'uk_course_idempotency'
);
SET @add_idempotency_index_sql := IF(
  @idempotency_index_exists = 0,
  'ALTER TABLE courses ADD UNIQUE KEY uk_course_idempotency (user_id, idempotency_key)',
  'SELECT 1'
);
PREPARE add_idempotency_index_statement FROM @add_idempotency_index_sql;
EXECUTE add_idempotency_index_statement;
DEALLOCATE PREPARE add_idempotency_index_statement;

SELECT RELEASE_LOCK('culturepath_20260803_add_course_idempotency');
