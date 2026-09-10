import { migrate } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

/**
 * The tests that need a real database.
 *
 * Everything else in `tests/` is a pure rule, which is why the suite runs
 * anywhere with no setup. But several rules that went wrong in production were
 * written in SQL: a status that could move backwards, presence that could only
 * ever become true, a lock that was really two statements. Those are asserted
 * here, against Postgres, because there is nothing else to assert them against.
 *
 * Opt in by pointing `UMBRA_TEST_DATABASE_URL` at a database these tests may
 * empty. Without it they are skipped rather than failed: a checkout with no
 * Postgres to hand is not a broken checkout.
 */

export const DATABASE_URL = process.env.UMBRA_TEST_DATABASE_URL;
export const hasDatabase = Boolean(DATABASE_URL);

/**
 * Applies the schema.
 *
 * The domain modules read `DATABASE_URL` the first time they touch the pool, so
 * it is set here and they are imported afterwards, never before.
 */
export async function prepareDatabase(): Promise<void> {
  if (!DATABASE_URL) return;
  process.env.DATABASE_URL = DATABASE_URL;

  /*
   * The configuration is validated as a whole, so a domain module that only
   * needs the database still asks for the gateway keys. These are placeholders
   * for a suite that reaches no gateway: a test that needs Janus does not
   * belong here at all.
   */
  process.env.JANUS_URL ??= "https://janus.invalid";
  process.env.JANUS_APPLICATION_ID ??= "umbra-test";
  process.env.JANUS_API_KEY ??= "umbra-test";

  const sql = postgres(DATABASE_URL, { max: 1 });
  try {
    await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
  } finally {
    await sql.end();
  }
}

/** Empties every table, so one test never reads what another one wrote. */
export async function emptyDatabase(): Promise<void> {
  if (!DATABASE_URL) return;

  const sql = postgres(DATABASE_URL, { max: 1 });
  try {
    await sql`
      TRUNCATE account, media, library_item, media_request, tracked_series,
               episode, episode_task, report, report_follower, notification,
               taste_profile, announcement, storage_snapshot,
               storage_tree_snapshot, job_run, job_state, analytics_daily,
               session, auth_pin
      RESTART IDENTITY CASCADE
    `;
  } finally {
    await sql.end();
  }
}
