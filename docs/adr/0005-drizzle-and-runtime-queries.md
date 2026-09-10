# 0005 - Drizzle with committed SQL migrations

Status: accepted, amended by `docs/adr/0010-no-funding-goal.md` (the index for
one active funding goal went with the tables it guarded; everything else stands)

## Context

The application needs a typed data layer and a migration story that survives a
deployment where the container is the only thing that runs.

## Decision

Drizzle ORM over `postgres.js`. The schema is TypeScript, migrations are
generated from it into `drizzle/` and committed. They are applied at server
start by `src/instrumentation.ts`.

Constraints that matter to correctness are expressed in the schema, not in
application code: partial unique indexes for one live request per title and one
active funding goal, a composite unique index for one vote per person, and a
natural key on episodes so a resync updates instead of duplicating.

## Consequences

- No separate migration step in the pipeline, and a restart is a safe retry.
- SQL is visible and reviewable, rather than generated at deploy time.
- Two containers share the image, so only the web container migrates; the worker
  runs with `MIGRATE_ON_START=false`.
- Where a query is clearer as SQL, notably the reconciliation passes, it is
  written as SQL through `db().execute`.
