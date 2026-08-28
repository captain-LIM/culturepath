-- AI 미리보기와 일반 코스 편집이 더 최신 변경을 조용히 덮어쓰지 않도록
-- 낙관적 동시성 제어용 단조 증가 revision을 추가한다.
SET @migration_lock_acquired := GET_LOCK(
  'culturepath_20260827_add_course_revision',
  10
);

SET @course_revision_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'courses'
    AND COLUMN_NAME = 'revision'
);
SET @add_course_revision_sql := IF(
  @migration_lock_acquired = 1,
  IF(
    @course_revision_exists = 0,
    'ALTER TABLE courses ADD COLUMN revision BIGINT UNSIGNED NOT NULL DEFAULT 1 AFTER updated_at',
    'SELECT 1'
  ),
  'SIGNAL SQLSTATE ''45000'' SET MESSAGE_TEXT = ''Could not acquire migration lock'''
);
PREPARE add_course_revision_statement FROM @add_course_revision_sql;
EXECUTE add_course_revision_statement;
DEALLOCATE PREPARE add_course_revision_statement;

SELECT RELEASE_LOCK('culturepath_20260827_add_course_revision');
