-- 장소 상세를 중문(ChsService2, 간체)으로도 보여주기 위해 places_cache에 중문
-- 상세 캐시 컬럼을 추가한다. 영문/일문 상세 캐시 컬럼과 동일한 패턴이다. Keep
-- this migration repeatable across environments.
SET @migration_lock_acquired := GET_LOCK(
  'culturepath_20260823_add_places_cache_chinese_detail',
  10
);

SET @detail_json_zh_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'places_cache'
    AND COLUMN_NAME = 'detail_json_zh'
);
SET @add_detail_json_zh_sql := IF(
  @migration_lock_acquired = 1,
  IF(
    @detail_json_zh_exists = 0,
    'ALTER TABLE places_cache ADD COLUMN detail_json_zh JSON DEFAULT NULL AFTER detail_json_ja',
    'SELECT 1'
  ),
  'SIGNAL SQLSTATE ''45000'' SET MESSAGE_TEXT = ''Could not acquire migration lock'''
);
PREPARE add_detail_json_zh_statement FROM @add_detail_json_zh_sql;
EXECUTE add_detail_json_zh_statement;
DEALLOCATE PREPARE add_detail_json_zh_statement;

SET @detail_cached_at_zh_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'places_cache'
    AND COLUMN_NAME = 'detail_cached_at_zh'
);
SET @add_detail_cached_at_zh_sql := IF(
  @migration_lock_acquired = 1,
  IF(
    @detail_cached_at_zh_exists = 0,
    'ALTER TABLE places_cache ADD COLUMN detail_cached_at_zh DATETIME(3) DEFAULT NULL AFTER detail_expires_at_ja',
    'SELECT 1'
  ),
  'SIGNAL SQLSTATE ''45000'' SET MESSAGE_TEXT = ''Could not acquire migration lock'''
);
PREPARE add_detail_cached_at_zh_statement FROM @add_detail_cached_at_zh_sql;
EXECUTE add_detail_cached_at_zh_statement;
DEALLOCATE PREPARE add_detail_cached_at_zh_statement;

SET @detail_expires_at_zh_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'places_cache'
    AND COLUMN_NAME = 'detail_expires_at_zh'
);
SET @add_detail_expires_at_zh_sql := IF(
  @migration_lock_acquired = 1,
  IF(
    @detail_expires_at_zh_exists = 0,
    'ALTER TABLE places_cache ADD COLUMN detail_expires_at_zh DATETIME(3) DEFAULT NULL AFTER detail_cached_at_zh',
    'SELECT 1'
  ),
  'SIGNAL SQLSTATE ''45000'' SET MESSAGE_TEXT = ''Could not acquire migration lock'''
);
PREPARE add_detail_expires_at_zh_statement FROM @add_detail_expires_at_zh_sql;
EXECUTE add_detail_expires_at_zh_statement;
DEALLOCATE PREPARE add_detail_expires_at_zh_statement;

SELECT RELEASE_LOCK('culturepath_20260823_add_places_cache_chinese_detail');
