-- 공개 코스에 담긴 장소 수를 contentId 단위로 집계할 때 전체 트랙 스캔을
-- 피하도록 복합 인덱스를 추가한다. 여러 환경에서 재실행할 수 있어야 한다.
SET @migration_lock_acquired := GET_LOCK(
  'culturepath_20260825_add_course_place_usage_index',
  10
);

SET @course_place_usage_index_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'course_tracks'
    AND INDEX_NAME = 'idx_course_tracks_content_course'
);
SET @add_course_place_usage_index_sql := IF(
  @migration_lock_acquired = 1,
  IF(
    @course_place_usage_index_exists = 0,
    'ALTER TABLE course_tracks ADD INDEX idx_course_tracks_content_course (content_id, course_id)',
    'SELECT 1'
  ),
  'SIGNAL SQLSTATE ''45000'' SET MESSAGE_TEXT = ''Could not acquire migration lock'''
);
PREPARE add_course_place_usage_index_statement FROM @add_course_place_usage_index_sql;
EXECUTE add_course_place_usage_index_statement;
DEALLOCATE PREPARE add_course_place_usage_index_statement;

SELECT RELEASE_LOCK('culturepath_20260825_add_course_place_usage_index');
