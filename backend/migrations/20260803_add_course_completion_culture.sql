-- Existing databases do not pick up new columns from CREATE TABLE IF NOT EXISTS.
-- Keep this migration repeatable so local and deployed MySQL instances can run it safely.
SET @culture_column_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'course_completions'
    AND COLUMN_NAME = 'culture'
);

SET @add_culture_column_sql := IF(
  @culture_column_exists = 0,
  'ALTER TABLE course_completions ADD COLUMN culture VARCHAR(30) DEFAULT NULL AFTER note',
  'SELECT 1'
);

PREPARE add_culture_column_statement FROM @add_culture_column_sql;
EXECUTE add_culture_column_statement;
DEALLOCATE PREPARE add_culture_column_statement;
