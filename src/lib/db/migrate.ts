import { migrate } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

/**
 * One migration at a time, whoever starts.
 *
 * Two containers coming up together would otherwise run the same pending
 * migration at the same moment, and the second one would fail on a statement
 * the first had already applied. A lock held on the connection makes the
 * second wait and then find nothing left to do. Advisory rather than a table
 * of our own, so nothing has to exist before the first migration runs.
 */
const MIGRATION_LOCK = 0x756d6272;

/**
 * Applies pending migrations, then exits.
 *
 * Run before the server starts, on every deployment. Drizzle records what it has
 * applied, so running it twice is a no-op and a half-finished deployment can
 * simply be run again.
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  // `max: 1` because migrations must run in one sequence, not in parallel.
  const sql = postgres(url, { max: 1 });
  try {
    await sql`SELECT pg_advisory_lock(${MIGRATION_LOCK})`;
    try {
      await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
      console.log("[migrate] schema is up to date");
    } finally {
      await sql`SELECT pg_advisory_unlock(${MIGRATION_LOCK})`;
    }
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error("[migrate] failed", error);
  process.exit(1);
});
