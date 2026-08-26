# Database migrations

`schema.sql` creates a new database, while the numbered files in this directory
upgrade an existing database. `CREATE TABLE IF NOT EXISTS` does not add newly
introduced columns to an existing table, so deployments must run both steps.

Apply migrations in filename order after backing up the target database:

```powershell
mysql --host=<host> --user=<user> --password --database=<database> --execute="source backend/migrations/20260803_add_course_completion_culture.sql"
mysql --host=<host> --user=<user> --password --database=<database> --execute="source backend/migrations/20260803_add_course_idempotency.sql"
mysql --host=<host> --user=<user> --password --database=<database> --execute="source backend/migrations/20260812_add_course_track_coordinates.sql"
mysql --host=<host> --user=<user> --password --database=<database> --execute="source backend/migrations/20260820_add_places_cache_english_detail.sql"
mysql --host=<host> --user=<user> --password --database=<database> --execute="source backend/migrations/20260820_add_places_cache_japanese_detail.sql"
mysql --host=<host> --user=<user> --password --database=<database> --execute="source backend/migrations/20260823_add_places_cache_chinese_detail.sql"
mysql --host=<host> --user=<user> --password --database=<database> --execute="source backend/migrations/20260824_add_course_tracks_place_images.sql"
mysql --host=<host> --user=<user> --password --database=<database> --execute="source backend/migrations/20260825_add_course_place_usage_index.sql"
```

The place translation migrations must stay in `en` → `ja` → `zh` order because
each new column is positioned after the previous locale column. The migrations
are repeatable and use MySQL advisory locks so two deployments cannot race
between the column check and `ALTER TABLE`. A lock timeout fails the migration
instead of silently skipping it. Run schema changes with a migration account;
the minimum-privilege Backend account is not expected to have `ALTER`.

This repository does not yet contain a migration runner. Local automated tests
do not start Docker or MySQL, so a staging deployment must verify the migration
on an empty schema, an existing schema, and a second repeated execution before
production rollout. The place-usage migration must also be checked with
`EXPLAIN` against representative public/private and duplicate course rows so the
`idx_course_tracks_content_course` index is selected and `COUNT(DISTINCT
course_id)` returns one count per course.
