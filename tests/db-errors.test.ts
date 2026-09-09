import { describe, expect, it } from "vitest";

import { isUniqueViolation, UNIQUE_VIOLATION } from "@/lib/db/errors";

describe("unique violation detection", () => {
  it("reads the code on the error itself", () => {
    expect(isUniqueViolation({ code: UNIQUE_VIOLATION })).toBe(true);
  });

  it("reads it through the wrapper the query builder throws", () => {
    // Drizzle wraps driver errors, so the Postgres code sits on the cause.
    // Missing that is how a deliberate constraint became a 500.
    const wrapped = Object.assign(new Error("Failed query: insert into vote"), {
      cause: Object.assign(new Error("duplicate key value"), {
        code: UNIQUE_VIOLATION,
      }),
    });
    expect(isUniqueViolation(wrapped)).toBe(true);
  });

  it("ignores anything else", () => {
    expect(isUniqueViolation(new Error("boom"))).toBe(false);
    expect(isUniqueViolation({ code: "23503" })).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
  });
});
