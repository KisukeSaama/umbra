import { describe, expect, it } from "vitest";

import { noteFor } from "@/lib/domain/requests";

/**
 * The only free text in the product, and the rule that keeps it from lingering:
 * a word explaining that a title is being looked for has nothing left to say
 * once the title is there.
 */
describe("the note left on a request", () => {
  it("keeps the note when a move does not carry one", () => {
    expect(noteFor("processing", undefined)).toBeUndefined();
  });

  it("stores what was typed, trimmed", () => {
    expect(noteFor("accepted", "  found, downloading tonight  ")).toBe(
      "found, downloading tonight",
    );
  });

  it("treats an empty box as an erasure rather than an empty sentence", () => {
    expect(noteFor("accepted", "   ")).toBeNull();
    expect(noteFor("accepted", null)).toBeNull();
  });

  it("erases the note when the title reaches the server", () => {
    expect(noteFor("available", "still looking")).toBeNull();
    expect(noteFor("available", undefined)).toBeNull();
  });
});
