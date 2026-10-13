import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/*
 * What a client module may not import as a value: the schema, the connection,
 * and Drizzle itself. Each one ships the query builder, and with the schema
 * every table and index, to the browser.
 */
const SERVER_ONLY_SOURCES = [
  {
    test: (source) => source === "@/lib/db/schema",
    message:
      "A client module must not import a value from the schema: it ships Drizzle to the browser. Put the value in a module of its own, as `@/lib/announcements` does.",
  },
  {
    test: (source) => source === "@/lib/db",
    message: "A client module must not import the database connection.",
  },
  {
    test: (source) =>
      source === "drizzle-orm" || source.startsWith("drizzle-orm/"),
    message:
      "A client module must not import Drizzle: queries belong to the domain layer, on the server.",
  },
];

/**
 * The same guard for any module that declares `"use client"`, wherever it
 * lives: a path pattern only covers the folders someone thought of, and the
 * error pages and the i18n provider are client modules outside
 * `src/components`.
 */
const clientBoundary = {
  rules: {
    "no-server-imports": {
      meta: { type: "problem", schema: [] },
      create(context) {
        let isClient = false;
        return {
          Program(node) {
            isClient = node.body.some(
              (statement) =>
                statement.type === "ExpressionStatement" &&
                statement.directive === "use client",
            );
          },
          ImportDeclaration(node) {
            if (!isClient || node.importKind === "type") return;
            const valueSpecifiers = node.specifiers.filter(
              (specifier) => specifier.importKind !== "type",
            );
            if (node.specifiers.length > 0 && valueSpecifiers.length === 0)
              return;
            const source = String(node.source.value);
            const hit = SERVER_ONLY_SOURCES.find((entry) => entry.test(source));
            if (hit) context.report({ node, message: hit.message });
          },
        };
      },
    },
  },
};

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
            {
              name: "drizzle-orm",
              allowTypeImports: true,
              message:
                "A component must not import Drizzle: queries belong to the domain layer, on the server.",
            },
          ],
          patterns: [
            {
              group: ["drizzle-orm/*"],
              allowTypeImports: true,
              message:
                "A component must not import Drizzle: queries belong to the domain layer, on the server.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { umbra: clientBoundary },
    rules: { "umbra/no-server-imports": "error" },
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
