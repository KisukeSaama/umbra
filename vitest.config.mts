import path from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    /*
     * The timezone the application runs in, so what a date means in a test is
     * what it means in production. Several rules compare a broadcast date with
     * the day the server stands in, and a suite run in another zone would
     * disagree with them for a few hours either side of midnight.
     */
    env: { TZ: "Europe/Paris" },
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
      // `server-only` throws outside a React Server Component graph. The modules
      // under test are server modules by design, so it is stubbed here rather
      // than removed from the source.
      "server-only": path.resolve(
        import.meta.dirname,
        "./tests/stubs/server-only.ts",
      ),
    },
  },
});
