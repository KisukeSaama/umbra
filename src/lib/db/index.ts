import "server-only";

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

function client() {
  globalForDb.umbraSql ??= postgres(env().DATABASE_URL, { max: 10 });
  return globalForDb.umbraSql;
}

let cachedDb: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function db() {
  cachedDb ??= drizzle(client(), { schema });
  return cachedDb;
}

export { schema };
