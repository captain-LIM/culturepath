-- Existing databases do not pick up new columns from CREATE TABLE IF NOT EXISTS.
-- Keep this migration repeatable so local and deployed MySQL instances can run it safely.
SET @migration_lock_acquired := GET_LOCK(
  'culturepath_20260803_add_course_completion_culture',
  10
);

SET @culture_column_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'course_completions'
    AND COLUMN_NAME = 'culture'
);

SET @add_culture_column_sql := IF(
  @migration_lock_acquired = 1,
  IF(
    @culture_column_exists = 0,
    'ALTER TABLE course_completions ADD COLUMN culture VARCHAR(30) DEFAULT NULL AFTER note',
    'SELECT 1'
  ),
  'SIGNAL SQLSTATE ''45000'' SET MESSAGE_TEXT = ''Could not acquire migration lock'''
);

PREPARE add_culture_column_statement FROM @add_culture_column_sql;
EXECUTE add_culture_column_statement;
DEALLOCATE PREPARE add_culture_column_statement;

SELECT RELEASE_LOCK('culturepath_20260803_add_course_completion_culture');
