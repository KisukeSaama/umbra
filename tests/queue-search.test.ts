import { describe, expect, it } from "vitest";

import { parseQueueSearch, queueSearchTerms } from "@/lib/queue";

/**
 * The search box above the administration queues. What is pinned here is how
 * what was typed is read; where each word is looked for is SQL, and asserted
 * against a database.
 */
describe("a search typed above a queue", () => {
  it("reads nothing as nothing", () => {
    expect(parseQueueSearch(undefined)).toBe("");
    expect(parseQueueSearch(null)).toBe("");
    expect(parseQueueSearch("   ")).toBe("");
  });

  it("trims it and makes runs of spaces one", () => {
    expect(parseQueueSearch("  dune   kisu \t")).toBe("dune kisu");
  });

  it("reads the first of a repeated parameter", () => {
    expect(parseQueueSearch(["alien", "dune"])).toBe("alien");
  });

  it("cuts a pasted paragraph to a length a person types", () => {
    expect(parseQueueSearch("a".repeat(500))).toHaveLength(100);
  });

  it("splits it into words, each looked for on its own", () => {
    expect(queueSearchTerms("dune kisu")).toEqual(["dune", "kisu"]);
    expect(queueSearchTerms("")).toEqual([]);
  });

  it("looks for the same word once, case aside", () => {
    expect(queueSearchTerms("Dune dune DUNE")).toEqual(["Dune"]);
  });

  it("stops at a handful of words", () => {
    expect(queueSearchTerms("a b c d e f g h")).toHaveLength(6);
  });
});
