-- Course places were saved without latitude/longitude, so map views have no
-- coordinates to plot. Keep this migration repeatable across environments.
SET @migration_lock_acquired := GET_LOCK(
  'culturepath_20260812_add_course_track_coordinates',
  10
);

SET @latitude_column_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'course_tracks'
    AND COLUMN_NAME = 'place_latitude'
);
SET @add_latitude_column_sql := IF(
  @migration_lock_acquired = 1,
  IF(
    @latitude_column_exists = 0,
    'ALTER TABLE course_tracks ADD COLUMN place_latitude DECIMAL(10,7) DEFAULT NULL AFTER place_region',
    'SELECT 1'
  ),
  'SIGNAL SQLSTATE ''45000'' SET MESSAGE_TEXT = ''Could not acquire migration lock'''
);
PREPARE add_latitude_column_statement FROM @add_latitude_column_sql;
EXECUTE add_latitude_column_statement;
DEALLOCATE PREPARE add_latitude_column_statement;

SET @longitude_column_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'course_tracks'
    AND COLUMN_NAME = 'place_longitude'
);
SET @add_longitude_column_sql := IF(
  @migration_lock_acquired = 1,
  IF(
    @longitude_column_exists = 0,
    'ALTER TABLE course_tracks ADD COLUMN place_longitude DECIMAL(10,7) DEFAULT NULL AFTER place_latitude',
    'SELECT 1'
  ),
  'SIGNAL SQLSTATE ''45000'' SET MESSAGE_TEXT = ''Could not acquire migration lock'''
);
PREPARE add_longitude_column_statement FROM @add_longitude_column_sql;
EXECUTE add_longitude_column_statement;
DEALLOCATE PREPARE add_longitude_column_statement;

SELECT RELEASE_LOCK('culturepath_20260812_add_course_track_coordinates');
