/**
 * Reading Postgres errors through the query builder.
 *
 * Drizzle wraps driver errors, so the Postgres code lives on the cause rather
 * than on the error itself. Checking only the top level is how a deliberate
 * unique constraint ends up reported as an internal error.
 */

/** Postgres unique violation. */
export const UNIQUE_VIOLATION = "23505";

export function isUniqueViolation(error: unknown): boolean {
  return hasPostgresCode(error, UNIQUE_VIOLATION);
}

function hasPostgresCode(error: unknown, code: string, depth = 0): boolean {
  if (depth > 4 || typeof error !== "object" || error === null) return false;

  const candidate = error as { code?: unknown; cause?: unknown };
  if (candidate.code === code) return true;

  return hasPostgresCode(candidate.cause, code, depth + 1);
}
