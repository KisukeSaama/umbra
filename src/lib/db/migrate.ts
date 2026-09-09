import { migrate } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

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
    await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
    console.log("[migrate] schema is up to date");
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error("[migrate] failed", error);
  process.exit(1);
});
