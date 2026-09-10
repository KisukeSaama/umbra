/**
 * Runs once when the server process starts.
 *
 * Migrations are applied here rather than in a deployment step: the container
 * that owns the schema is the one that uses it, and Drizzle records what it has
 * already applied, so a restart is free and a half-finished rollout is fixed by
 * starting again.
 *
 * Set `MIGRATE_ON_START=false` to take that over from outside.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.MIGRATE_ON_START === "false") return;
  if (!process.env.DATABASE_URL) return;

  const [{ drizzle }, { migrate }, postgres] = await Promise.all([
    import("drizzle-orm/postgres-js"),
    import("drizzle-orm/postgres-js/migrator"),
    import("postgres").then((module) => module.default),
  ]);

  // One connection, closed straight away: this is a boot task, not a pool.
  const sql = postgres(process.env.DATABASE_URL, { max: 1 });
  try {
    /*
     * One migration at a time, whoever boots first.
     *
     * Two containers starting together would otherwise apply the same pending
     * migration at the same moment, and the second would fail on a statement
     * the first had already run. Holding a lock on this connection makes the
     * second wait and then find nothing left to do.
     */
    await sql`SELECT pg_advisory_lock(${MIGRATION_LOCK})`;
    try {
      await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
      console.log("[migrate] schema is up to date");
    } finally {
      await sql`SELECT pg_advisory_unlock(${MIGRATION_LOCK})`;
    }
  } catch (error) {
    console.error("[migrate] failed", error);
    throw error;
  } finally {
    await sql.end();
  }
}

/** The same number on both sides: see `src/lib/db/migrate.ts`. */
const MIGRATION_LOCK = 0x756d6272;
