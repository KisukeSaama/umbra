import { defineConfig } from "drizzle-kit";

/**
 * Migrations are generated from `src/lib/db/schema.ts` and committed under
 * `drizzle/`. They are applied at container start, never generated there.
 */
export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ?? "postgres://umbra:umbra@localhost:5432/umbra",
  },
  strict: true,
  verbose: true,
});
