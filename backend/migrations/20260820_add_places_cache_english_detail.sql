-- 장소 상세를 영문(EngService2)으로도 보여주기 위해 places_cache에 영문 상세
-- 캐시 컬럼을 추가한다. Keep this migration repeatable across environments.
SET @migration_lock_acquired := GET_LOCK(
  'culturepath_20260820_add_places_cache_english_detail',
  10
);

SET @detail_json_en_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'places_cache'
    AND COLUMN_NAME = 'detail_json_en'
);
SET @add_detail_json_en_sql := IF(
  @migration_lock_acquired = 1,
  IF(
    @detail_json_en_exists = 0,
    'ALTER TABLE places_cache ADD COLUMN detail_json_en JSON DEFAULT NULL AFTER detail_json',
    'SELECT 1'
  ),
  'SIGNAL SQLSTATE ''45000'' SET MESSAGE_TEXT = ''Could not acquire migration lock'''
);
PREPARE add_detail_json_en_statement FROM @add_detail_json_en_sql;
EXECUTE add_detail_json_en_statement;
DEALLOCATE PREPARE add_detail_json_en_statement;

SET @detail_cached_at_en_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'places_cache'
    AND COLUMN_NAME = 'detail_cached_at_en'
);
SET @add_detail_cached_at_en_sql := IF(
  @migration_lock_acquired = 1,
  IF(
    @detail_cached_at_en_exists = 0,
    'ALTER TABLE places_cache ADD COLUMN detail_cached_at_en DATETIME(3) DEFAULT NULL AFTER detail_expires_at',
    'SELECT 1'
  ),
  'SIGNAL SQLSTATE ''45000'' SET MESSAGE_TEXT = ''Could not acquire migration lock'''
);
PREPARE add_detail_cached_at_en_statement FROM @add_detail_cached_at_en_sql;
EXECUTE add_detail_cached_at_en_statement;
DEALLOCATE PREPARE add_detail_cached_at_en_statement;

SET @detail_expires_at_en_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'places_cache'
    AND COLUMN_NAME = 'detail_expires_at_en'
);
SET @add_detail_expires_at_en_sql := IF(
  @migration_lock_acquired = 1,
  IF(
    @detail_expires_at_en_exists = 0,
    'ALTER TABLE places_cache ADD COLUMN detail_expires_at_en DATETIME(3) DEFAULT NULL AFTER detail_cached_at_en',
    'SELECT 1'
  ),
  'SIGNAL SQLSTATE ''45000'' SET MESSAGE_TEXT = ''Could not acquire migration lock'''
);
PREPARE add_detail_expires_at_en_statement FROM @add_detail_expires_at_en_sql;
EXECUTE add_detail_expires_at_en_statement;
DEALLOCATE PREPARE add_detail_expires_at_en_statement;

SELECT RELEASE_LOCK('culturepath_20260820_add_places_cache_english_detail');
