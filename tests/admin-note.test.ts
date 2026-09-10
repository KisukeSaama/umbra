import { describe, expect, it } from "vitest";

import { canCarryNote, noteFor } from "@/lib/domain/requests";
import { reportNoteFor } from "@/lib/domain/reports";

/**
 * The only free text in the product, and the rule that keeps it from lingering:
 * a word explaining that a title is being looked for has nothing left to say
 * once the title is there.
 */
describe("the note left on a request", () => {
  it("keeps the note when a move does not carry one", () => {
    expect(noteFor("accepted", undefined)).toBeUndefined();
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

  it("stays writable for as long as it is shown", () => {
    expect(canCarryNote("requested")).toBe(true);
    expect(canCarryNote("accepted")).toBe(true);
    expect(canCarryNote("rejected")).toBe(true);
    expect(canCarryNote("available")).toBe(false);
  });
});

/**
 * Nearly the same rule on a report, which parts ways with a request at the end:
 * an ask that arrives has answered itself, a report that closes has not, so the
 * last word stays as the outcome. One note per report, replaced rather than
 * added to.
 */
describe("the note left on a report", () => {
  it("keeps the note when a move does not carry one", () => {
    expect(reportNoteFor(undefined)).toBeUndefined();
  });

  it("stores what was typed, trimmed", () => {
    expect(reportNoteFor("  re-encoding it  ")).toBe("re-encoding it");
  });

  it("treats an empty box as an erasure rather than an empty sentence", () => {
    expect(reportNoteFor("   ")).toBeNull();
    expect(reportNoteFor(null)).toBeNull();
  });

  it("keeps the outcome readable once the problem is fixed", () => {
    expect(reportNoteFor("re-encoded and back")).toBe("re-encoded and back");
    expect(reportNoteFor(undefined)).toBeUndefined();
  });

  it("replaces the ageing word rather than adding to it", () => {
    expect(reportNoteFor("  the season is complete  ")).toBe(
      "the season is complete",
    );
    expect(reportNoteFor("")).toBeNull();
  });

  it("keeps a refusal explained", () => {
    expect(reportNoteFor("not something we index")).toBe(
      "not something we index",
    );
    expect(reportNoteFor("already reported elsewhere")).toBe(
      "already reported elsewhere",
    );
  });
});
