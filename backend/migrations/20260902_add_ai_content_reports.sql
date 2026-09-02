SET @migration_lock_acquired := GET_LOCK(
  'culturepath_20260902_add_ai_content_reports',
  10
);

SET @create_ai_content_reports_sql := IF(
  @migration_lock_acquired = 1,
  'CREATE TABLE IF NOT EXISTS ai_content_reports (
    id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id     INT DEFAULT NULL,
    session_id  CHAR(36) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
    content     TEXT NOT NULL,
    reason      VARCHAR(500) DEFAULT NULL,
    status      ENUM(''pending'', ''reviewed'', ''resolved'', ''dismissed'') NOT NULL DEFAULT ''pending'',
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TIMESTAMP NULL DEFAULT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_ai_content_reports_status_created (status, created_at),
    INDEX idx_ai_content_reports_user_created (user_id, created_at)
  )',
  'SIGNAL SQLSTATE ''45000'' SET MESSAGE_TEXT = ''Could not acquire migration lock'''
);
PREPARE create_ai_content_reports_statement FROM @create_ai_content_reports_sql;
EXECUTE create_ai_content_reports_statement;
DEALLOCATE PREPARE create_ai_content_reports_statement;

SELECT RELEASE_LOCK('culturepath_20260902_add_ai_content_reports');
