-- Short-lived, email-verified account deletion requests.
-- Raw email addresses and raw capability tokens are intentionally not stored.
SET @migration_lock_acquired := GET_LOCK(
  'culturepath_20260902_add_account_deletion_requests',
  10
);

SET @create_account_deletion_requests_sql := IF(
  @migration_lock_acquired = 1,
  'CREATE TABLE IF NOT EXISTS account_deletion_requests (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    locale ENUM(''ko'', ''en'', ''ja'', ''zh'') NOT NULL DEFAULT ''ko'',
    token_expires_at DATETIME NOT NULL,
    last_sent_at DATETIME NOT NULL,
    send_window_started_at DATETIME NOT NULL,
    send_count TINYINT UNSIGNED NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_account_deletion_request_user (user_id),
    UNIQUE KEY uq_account_deletion_request_token (token_hash),
    INDEX idx_account_deletion_request_expiry (token_expires_at),
    CONSTRAINT fk_account_deletion_request_user
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )',
  'SIGNAL SQLSTATE ''45000'' SET MESSAGE_TEXT = ''Could not acquire migration lock'''
);
PREPARE create_account_deletion_requests_statement
  FROM @create_account_deletion_requests_sql;
EXECUTE create_account_deletion_requests_statement;
DEALLOCATE PREPARE create_account_deletion_requests_statement;

SELECT RELEASE_LOCK('culturepath_20260902_add_account_deletion_requests');
