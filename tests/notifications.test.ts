import { describe, expect, it } from "vitest";

import { dedupKeyFor } from "@/lib/domain/notifications";

/**
 * The notification key is what makes the jobs safe to rerun. It is one line of
 * code and it carries the whole idempotency guarantee, so it gets its own test.
 */
describe("notification keys", () => {
  it("distinguishes two steps of the same subject", () => {
    // Keyed on the subject alone, a request going accepted and then available
    // would announce the first and swallow the second, which is the one the
    // member was actually waiting for.
    const accepted = dedupKeyFor({
      kind: "request_status",
      subjectId: "a",
      step: "accepted",
      payload: {},
    });
    const available = dedupKeyFor({
      kind: "request_status",
      subjectId: "a",
      step: "available",
      payload: {},
    });
    expect(accepted).not.toBe(available);
  });

  it("is stable, so replaying a job inserts nothing new", () => {
    const entry = {
      kind: "report_status" as const,
      subjectId: "b",
      step: "resolved",
      payload: { title: "changes between runs" },
    };
    expect(dedupKeyFor(entry)).toBe(
      dedupKeyFor({ ...entry, payload: { title: "and yet the key holds" } }),
    );
  });

  it("keeps two kinds about the same id apart", () => {
    expect(
      dedupKeyFor({
        kind: "announcement",
        subjectId: "c",
        step: "published",
        payload: {},
      }),
    ).not.toBe(
      dedupKeyFor({
        kind: "poll_open",
        subjectId: "c",
        step: "published",
        payload: {},
      }),
    );
  });

  it("still produces a key when there is no subject", () => {
    // A null subject must not collide with another null subject of the same
    // kind, which is why the key spells the absence rather than leaving a gap.
    expect(
      dedupKeyFor({
        kind: "announcement",
        subjectId: null,
        step: "published",
        payload: {},
      }),
    ).toContain("none");
  });
});
