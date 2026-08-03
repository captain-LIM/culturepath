# Database migrations

`schema.sql` creates a new database, while the numbered files in this directory
upgrade an existing database. `CREATE TABLE IF NOT EXISTS` does not add newly
introduced columns to an existing table, so deployments must run both steps.

Apply migrations in filename order after backing up the target database:

```powershell
mysql --host=<host> --user=<user> --password --database=<database> --execute="source backend/migrations/20260803_add_course_completion_culture.sql"
mysql --host=<host> --user=<user> --password --database=<database> --execute="source backend/migrations/20260803_add_course_idempotency.sql"
```

The 2026-08-03 migration is repeatable and uses a MySQL advisory lock so two
deployments cannot race between the column check and `ALTER TABLE`. A lock
timeout fails the migration instead of silently skipping it.

This repository does not yet contain a migration runner. Local automated tests
do not start Docker or MySQL, so a staging deployment must verify the migration
on an empty schema, an existing schema, and a second repeated execution before
production rollout.
