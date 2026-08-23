-- 코스에 담긴 장소의 사진(TourAPI imageUrl/thumbnailUrl)이 저장 시 유실되어
-- 코스 상세 화면에서 항상 빈 썸네일만 보이던 문제를 고친다. course_tracks에
-- 이미지 URL 컬럼을 추가한다. Keep this migration repeatable across environments.
SET @migration_lock_acquired := GET_LOCK(
  'culturepath_20260824_add_course_tracks_place_images',
  10
);

SET @place_image_url_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'course_tracks'
    AND COLUMN_NAME = 'place_image_url'
);
SET @add_place_image_url_sql := IF(
  @migration_lock_acquired = 1,
  IF(
    @place_image_url_exists = 0,
    'ALTER TABLE course_tracks ADD COLUMN place_image_url VARCHAR(500) DEFAULT NULL AFTER place_longitude',
    'SELECT 1'
  ),
  'SIGNAL SQLSTATE ''45000'' SET MESSAGE_TEXT = ''Could not acquire migration lock'''
);
PREPARE add_place_image_url_statement FROM @add_place_image_url_sql;
EXECUTE add_place_image_url_statement;
DEALLOCATE PREPARE add_place_image_url_statement;

SET @place_thumbnail_url_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'course_tracks'
    AND COLUMN_NAME = 'place_thumbnail_url'
);
SET @add_place_thumbnail_url_sql := IF(
  @migration_lock_acquired = 1,
  IF(
    @place_thumbnail_url_exists = 0,
    'ALTER TABLE course_tracks ADD COLUMN place_thumbnail_url VARCHAR(500) DEFAULT NULL AFTER place_image_url',
    'SELECT 1'
  ),
  'SIGNAL SQLSTATE ''45000'' SET MESSAGE_TEXT = ''Could not acquire migration lock'''
);
PREPARE add_place_thumbnail_url_statement FROM @add_place_thumbnail_url_sql;
EXECUTE add_place_thumbnail_url_statement;
DEALLOCATE PREPARE add_place_thumbnail_url_statement;

SELECT RELEASE_LOCK('culturepath_20260824_add_course_tracks_place_images');
