import "server-only";

import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "@/lib/db/schema";
import { env } from "@/lib/env";

/**
 * Shared Postgres connection.
 *
 * Next reloads modules on every edit in development, so the pool is kept on
 * `globalThis` to avoid opening one connection per reload.
 */
const globalForDb = globalThis as unknown as {
  umbraSql?: ReturnType<typeof postgres>;
};

/**
 * Every wait has a bound.
 *
 * The pool is small, and the notification stream draws from the same one as
 * every page, so one query that never comes back is one connection fewer for
 * good: ten of those and the site stops answering. A statement is therefore
 * given a minute at most, a connection ten seconds to be handed over, and an
 * idle one is returned rather than held.
 */
const POOL = {
  max: 10,
  idle_timeout: 30,
  connect_timeout: 10,
  connection: { statement_timeout: 60_000 },
} as const;

function client() {
  globalForDb.umbraSql ??= postgres(env().DATABASE_URL, POOL);
  return globalForDb.umbraSql;
}

let cachedDb: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function db() {
  cachedDb ??= drizzle(client(), { schema });
  return cachedDb;
}

/**
 * A handle that reads and writes rows: the pool, or one transaction on it.
 *
 * What lets a domain function be called on its own or as one step of something
 * that has to happen all at once, without holding two versions of it.
 */
export type Db = ReturnType<typeof db>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type Queryable = Db | Tx;

/**
 * Can the database be read at all.
 *
 * The one question the container healthcheck asks. It lives here so that no
 * route holds SQL, however trivial: see `docs/architecture.md`.
 */
export async function ping(): Promise<void> {
  await db().execute(sql`SELECT 1`);
}

/**
 * The driver underneath Drizzle, for the one thing Drizzle does not model:
 * `LISTEN` and `NOTIFY`. Used by `src/lib/realtime.ts` and nowhere else;
 * everything that reads or writes rows goes through `db()`.
 */
export function dbClient() {
  return client();
}

export { schema };
