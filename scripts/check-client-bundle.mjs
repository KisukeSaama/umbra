#!/usr/bin/env node
/*
 * Fails when the browser bundle carries Drizzle.
 *
 * The ESLint guard (`eslint.config.mjs`) stops the imports it can see; this
 * stops the ones it cannot, such as a client module reaching the schema
 * through a module of its own. Drizzle tags each of its classes with a string
 * that minification keeps, so finding one in `.next/static` means the query
 * builder, and with the schema every table, was shipped to every visitor.
 *
 * Run after `next build`: `node scripts/check-client-bundle.mjs [dir]`.
 */

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.argv[2] ?? ".next/static");
const MARKERS = ["PgTable", "drizzle:Name"];

async function* scripts(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* scripts(full);
    else if (entry.name.endsWith(".js")) yield full;
  }
}

let checked = 0;
const offenders = [];
try {
  for await (const file of scripts(root)) {
    checked += 1;
    const text = await readFile(file, "utf8");
    const found = MARKERS.filter((marker) => text.includes(marker));
    if (found.length > 0)
      offenders.push(
        `${path.relative(process.cwd(), file)}: ${found.join(", ")}`,
      );
  }
} catch (error) {
  console.error(`[bundle] cannot read ${root}: run next build first.`, error);
  process.exit(1);
}

if (checked === 0) {
  console.error(`[bundle] no script under ${root}: run next build first.`);
  process.exit(1);
}

if (offenders.length > 0) {
  console.error("[bundle] Drizzle reached the browser bundle:");
  for (const line of offenders) console.error(`  ${line}`);
  process.exit(1);
}

console.log(`[bundle] ${checked} client scripts, no Drizzle in any of them.`);
