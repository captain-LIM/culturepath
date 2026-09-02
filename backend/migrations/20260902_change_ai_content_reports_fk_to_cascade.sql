-- Account deletion removes every AI report that is still linked to the user.
-- Reports already anonymized with user_id = NULL cannot be attributed safely
-- and are intentionally left untouched.
SET @migration_lock_acquired := GET_LOCK(
  'culturepath_20260902_change_ai_content_reports_fk_to_cascade',
  10
);

SET @ai_reports_table_exists := (
  SELECT COUNT(*)
  FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'ai_content_reports'
);
SET @ai_reports_user_fk_name := (
  SELECT CONSTRAINT_NAME
  FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'ai_content_reports'
    AND COLUMN_NAME = 'user_id'
    AND REFERENCED_TABLE_NAME = 'users'
    AND REFERENCED_COLUMN_NAME = 'id'
  LIMIT 1
);
SET @ai_reports_user_fk_delete_rule := (
  SELECT DELETE_RULE
  FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'ai_content_reports'
    AND CONSTRAINT_NAME = @ai_reports_user_fk_name
  LIMIT 1
);

SET @replace_ai_reports_user_fk_sql := IF(
  @migration_lock_acquired = 1,
  IF(
    @ai_reports_table_exists = 0,
    'SIGNAL SQLSTATE ''45000'' SET MESSAGE_TEXT = ''ai_content_reports table is missing''',
    IF(
      @ai_reports_user_fk_delete_rule = 'CASCADE',
      'SELECT 1',
      IF(
        @ai_reports_user_fk_name IS NULL,
        'ALTER TABLE ai_content_reports ADD CONSTRAINT fk_ai_content_reports_user_cascade FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE',
        CONCAT(
          'ALTER TABLE ai_content_reports DROP FOREIGN KEY `',
          REPLACE(@ai_reports_user_fk_name, '`', '``'),
          '`, ADD CONSTRAINT fk_ai_content_reports_user_cascade FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'
        )
      )
    )
  ),
  'SIGNAL SQLSTATE ''45000'' SET MESSAGE_TEXT = ''Could not acquire migration lock'''
);
PREPARE replace_ai_reports_user_fk_statement FROM @replace_ai_reports_user_fk_sql;
EXECUTE replace_ai_reports_user_fk_statement;
DEALLOCATE PREPARE replace_ai_reports_user_fk_statement;

SELECT RELEASE_LOCK('culturepath_20260902_change_ai_content_reports_fk_to_cascade');
