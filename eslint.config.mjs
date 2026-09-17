import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  /*
   * The schema never reaches the browser.
   *
   * `src/lib/db/schema.ts` imports Drizzle and names every table and index, and
   * a client component importing one value from it puts the whole of that in
   * the bundle: it happened once through the announcement composer, for two
   * lists of words. The lists now live in `@/lib/announcements`, and this is
   * what keeps the next one from going the same way. A type is fine, since it
   * is erased at compile time.
   *
   * `import "server-only"` in the schema itself would say it closer to the
   * source, but `drizzle-kit` loads that file outside any React graph to
   * generate the migrations, and the package throws there.
   */
  {
    files: ["src/components/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/db/schema",
              allowTypeImports: true,
              message:
                "A client component must not import a value from the schema: it ships Drizzle to the browser. Put the value in a module of its own, as `@/lib/announcements` does.",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
