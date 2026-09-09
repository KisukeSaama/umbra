import path from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
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
