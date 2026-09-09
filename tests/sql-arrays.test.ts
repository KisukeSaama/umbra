import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { intArray } from "@/lib/domain/library";

/**
 * The guided picker matches library genres with the overlap operator, and that
 * needs an array on both sides. Handing the template a JavaScript array instead
 * produced `($1, $2)::int[]`, a record cast that Postgres rejects, so every
 * answer to "I do not know what to watch" came back as a server error.
 */
describe("integer arrays in raw SQL", () => {
  it("renders an array rather than a row", () => {
    const query = new PgDialect().sqlToQuery(intArray([27, 53, 9648]));

    expect(query.sql).toBe("ARRAY[$1, $2, $3]::int[]");
    expect(query.params).toEqual([27, 53, 9648]);
  });
});
