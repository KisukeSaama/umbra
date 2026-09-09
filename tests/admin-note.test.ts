import { describe, expect, it } from "vitest";

import { canCarryNote, noteFor } from "@/lib/domain/requests";
import { canCarryReportNote, reportNoteFor } from "@/lib/domain/reports";

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

  it("stays writable for as long as it is shown", () => {
    expect(canCarryNote("requested")).toBe(true);
    expect(canCarryNote("accepted")).toBe(true);
    expect(canCarryNote("processing")).toBe(true);
    expect(canCarryNote("rejected")).toBe(true);
    expect(canCarryNote("available")).toBe(false);
  });
});

/** The same rule on a report, where being fixed is what ends the sentence. */
describe("the note left on a report", () => {
  it("keeps the note when a move does not carry one", () => {
    expect(reportNoteFor("in_progress", undefined)).toBeUndefined();
  });

  it("stores what was typed, trimmed", () => {
    expect(reportNoteFor("acknowledged", "  re-encoding it  ")).toBe(
      "re-encoding it",
    );
  });

  it("treats an empty box as an erasure rather than an empty sentence", () => {
    expect(reportNoteFor("acknowledged", "   ")).toBeNull();
    expect(reportNoteFor("acknowledged", null)).toBeNull();
  });

  it("erases the note once the problem is fixed", () => {
    expect(reportNoteFor("resolved", "still looking")).toBeNull();
    expect(reportNoteFor("resolved", undefined)).toBeNull();
  });

  it("keeps a refusal explained", () => {
    expect(reportNoteFor("rejected", "not something we index")).toBe(
      "not something we index",
    );
    expect(canCarryReportNote("rejected")).toBe(true);
    expect(canCarryReportNote("duplicate")).toBe(true);
    expect(canCarryReportNote("resolved")).toBe(false);
  });
});
