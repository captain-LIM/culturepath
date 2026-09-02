# Database migrations

`schema.sql` creates a new database, while the numbered files in this directory
upgrade an existing database. `CREATE TABLE IF NOT EXISTS` does not add newly
introduced columns to an existing table, so deployments must run both steps.

## Runner

`scripts/migrate.js` applies every `migrations/*.sql` in filename order and
records what it applied in the `schema_migrations` table, so re-runs skip work
that is already done. It has no framework dependency — it uses the `mysql2`
driver the app already ships.

```bash
npm run migrate            # apply all pending migrations
npm run migrate:list       # show applied / pending status, change nothing
npm run migrate -- --dry-run   # print the pending list, change nothing
npm run migrate -- --strict    # fail if an already-applied file was edited
npm run migrate -- --baseline  # record pending files as applied WITHOUT running
```

Connection comes from `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`.
Run schema changes with a migration account: the minimum-privilege Backend
account is not expected to have `ALTER`. Set `DB_MIGRATION_USER` /
`DB_MIGRATION_PASSWORD` to use a dedicated account; otherwise the runner falls
back to `DB_USER` / `DB_PASSWORD`.

The runner wraps the whole run in a `GET_LOCK('culturepath_schema_migrations')`
advisory lock, on top of each file's own lock, so two concurrent deployments
cannot race between "compute pending" and "apply".

### Deploy order

Run `npm run migrate` **before** rolling out the new application code. Every
migration is written to be idempotent (it checks `information_schema` first), so
running it against a schema that already has the change is a safe no-op.

### Existing production database

A database that already had these migrations applied by hand starts with an
empty `schema_migrations` ledger. Either:

- run `npm run migrate` once — the historical migrations no-op and get recorded, or
- run `npm run migrate -- --baseline` once to record them as applied without
  executing anything.

Do this once, then use the runner normally.

## Authoring notes

The place translation migrations must stay in `en` → `ja` → `zh` order because
each new column is positioned after the previous locale column. The migrations
are repeatable and use MySQL advisory locks so two deployments cannot race
between the column check and `ALTER TABLE`. A lock timeout fails the migration
instead of silently skipping it.

Local automated tests do not start Docker or MySQL (`test/migrateCli.test.js`
covers the runner's pure logic only), so a staging deployment must still verify
each new migration on an empty schema, an existing schema, and a second repeated
execution before production rollout. The place-usage migration must also be
checked with `EXPLAIN` against representative public/private and duplicate course
rows so the `idx_course_tracks_content_course` index is selected and
`COUNT(DISTINCT course_id)` returns one count per course.

The course-revision migration enables optimistic concurrency for course edits.
After applying it, clients that send `expectedRevision` receive HTTP `409`
instead of overwriting a newer edit. Older clients remain compatible but do not
gain stale-write protection until they send the revision returned by the API.

Once a migration file has been applied anywhere, do not edit it — add a new
dated file instead. `npm run migrate -- --strict` turns an edited-after-apply
file into a hard failure; the default run only warns.
