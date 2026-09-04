-- Google 로그인(POST /auth/google)이 참조하는 users.google_id 컬럼이 스키마에
-- 없어서 "Unknown column 'google_id' in 'where clause'"로 매 요청이 실패하던
-- 문제를 수정한다. Google 전용 가입은 비밀번호가 없으므로 password_hash도
-- NOT NULL을 해제한다.
SET @migration_lock_acquired := GET_LOCK(
  'culturepath_20260904_add_users_google_login',
  10
);

SET @google_id_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'google_id'
);
SET @add_google_id_sql := IF(
  @migration_lock_acquired = 1,
  IF(
    @google_id_exists = 0,
    'ALTER TABLE users ADD COLUMN google_id VARCHAR(255) NULL UNIQUE AFTER password_hash',
    'SELECT 1'
  ),
  'SIGNAL SQLSTATE ''45000'' SET MESSAGE_TEXT = ''Could not acquire migration lock'''
);
PREPARE add_google_id_statement FROM @add_google_id_sql;
EXECUTE add_google_id_statement;
DEALLOCATE PREPARE add_google_id_statement;

SET @password_hash_nullable := (
  SELECT IS_NULLABLE
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'password_hash'
);
SET @relax_password_hash_sql := IF(
  @migration_lock_acquired = 1,
  IF(
    @password_hash_nullable = 'NO',
    'ALTER TABLE users MODIFY COLUMN password_hash VARCHAR(255) NULL',
    'SELECT 1'
  ),
  'SIGNAL SQLSTATE ''45000'' SET MESSAGE_TEXT = ''Could not acquire migration lock'''
);
PREPARE relax_password_hash_statement FROM @relax_password_hash_sql;
EXECUTE relax_password_hash_statement;
DEALLOCATE PREPARE relax_password_hash_statement;

SELECT RELEASE_LOCK('culturepath_20260904_add_users_google_login');
