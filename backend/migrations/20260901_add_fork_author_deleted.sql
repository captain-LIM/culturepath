-- Keep fork provenance after an original author deletes their account without
-- persisting a locale-specific label or other author identifier.
SET @migration_lock_acquired := GET_LOCK(
  'culturepath_20260901_add_fork_author_deleted',
  10
);

SET @fork_author_deleted_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'courses'
    AND COLUMN_NAME = 'forked_from_author_deleted'
);
SET @add_fork_author_deleted_sql := IF(
  @migration_lock_acquired = 1,
  IF(
    @fork_author_deleted_exists = 0,
    'ALTER TABLE courses ADD COLUMN forked_from_author_deleted BOOLEAN NOT NULL DEFAULT FALSE AFTER forked_from_author_id',
    'SELECT 1'
  ),
  'SIGNAL SQLSTATE ''45000'' SET MESSAGE_TEXT = ''Could not acquire migration lock'''
);
PREPARE add_fork_author_deleted_statement FROM @add_fork_author_deleted_sql;
EXECUTE add_fork_author_deleted_statement;
DEALLOCATE PREPARE add_fork_author_deleted_statement;

SELECT RELEASE_LOCK('culturepath_20260901_add_fork_author_deleted');
