-- Add durable email-delivery state without storing a raw email address or token.
SET @migration_lock_acquired := GET_LOCK(
  'culturepath_20260903_add_account_deletion_outbox',
  10
);

SET @column_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'account_deletion_requests'
    AND COLUMN_NAME = 'token_nonce'
);
SET @migration_sql := IF(
  @migration_lock_acquired = 1,
  IF(@column_exists = 0,
    'ALTER TABLE account_deletion_requests ADD COLUMN token_nonce VARBINARY(32) NULL AFTER token_hash',
    'SELECT 1'),
  'SIGNAL SQLSTATE ''45000'' SET MESSAGE_TEXT = ''Could not acquire migration lock'''
);
PREPARE migration_statement FROM @migration_sql;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SET @column_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'account_deletion_requests'
    AND COLUMN_NAME = 'delivery_status'
);
SET @migration_sql := IF(@column_exists = 0,
  'ALTER TABLE account_deletion_requests ADD COLUMN delivery_status ENUM(''pending'', ''processing'', ''sent'', ''failed'') NOT NULL DEFAULT ''sent'' AFTER send_count',
  'SELECT 1');
PREPARE migration_statement FROM @migration_sql;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SET @column_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'account_deletion_requests'
    AND COLUMN_NAME = 'delivery_attempts'
);
SET @migration_sql := IF(@column_exists = 0,
  'ALTER TABLE account_deletion_requests ADD COLUMN delivery_attempts TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER delivery_status',
  'SELECT 1');
PREPARE migration_statement FROM @migration_sql;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SET @column_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'account_deletion_requests'
    AND COLUMN_NAME = 'next_delivery_attempt_at'
);
SET @migration_sql := IF(@column_exists = 0,
  'ALTER TABLE account_deletion_requests ADD COLUMN next_delivery_attempt_at DATETIME NULL AFTER delivery_attempts',
  'SELECT 1');
PREPARE migration_statement FROM @migration_sql;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SET @column_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'account_deletion_requests'
    AND COLUMN_NAME = 'delivery_claimed_at'
);
SET @migration_sql := IF(@column_exists = 0,
  'ALTER TABLE account_deletion_requests ADD COLUMN delivery_claimed_at DATETIME NULL AFTER next_delivery_attempt_at',
  'SELECT 1');
PREPARE migration_statement FROM @migration_sql;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SET @column_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'account_deletion_requests'
    AND COLUMN_NAME = 'delivery_claim_id'
);
SET @migration_sql := IF(@column_exists = 0,
  'ALTER TABLE account_deletion_requests ADD COLUMN delivery_claim_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL AFTER delivery_claimed_at',
  'SELECT 1');
PREPARE migration_statement FROM @migration_sql;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SET @column_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'account_deletion_requests'
    AND COLUMN_NAME = 'last_delivery_error_code'
);
SET @migration_sql := IF(@column_exists = 0,
  'ALTER TABLE account_deletion_requests ADD COLUMN last_delivery_error_code VARCHAR(80) NULL AFTER delivery_claim_id',
  'SELECT 1');
PREPARE migration_statement FROM @migration_sql;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SET @index_exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'account_deletion_requests'
    AND INDEX_NAME = 'idx_account_deletion_delivery'
);
SET @migration_sql := IF(@index_exists = 0,
  'ALTER TABLE account_deletion_requests ADD INDEX idx_account_deletion_delivery (delivery_status, next_delivery_attempt_at, delivery_claimed_at)',
  'SELECT 1');
PREPARE migration_statement FROM @migration_sql;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SELECT RELEASE_LOCK('culturepath_20260903_add_account_deletion_outbox');
