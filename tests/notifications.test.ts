import { describe, expect, it } from "vitest";

import { dedupKeyFor } from "@/lib/domain/notifications";
import { notificationMessages } from "@/lib/realtime";

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

/**
 * The live nudge carries account ids and nothing else, and Postgres refuses a
 * `NOTIFY` payload over 8000 bytes. Slicing is therefore the one thing between
 * a fan-out to everyone and a notification nobody hears.
 */
describe("live fan-out messages", () => {
  const uuid = (index: number) =>
    `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;

  it("says nothing when nobody was told", () => {
    expect(notificationMessages([])).toEqual([]);
  });

  it("sends one message for a handful of accounts", () => {
    const messages = notificationMessages([uuid(1), uuid(2)]);
    expect(messages).toHaveLength(1);
    expect(JSON.parse(messages[0])).toEqual([uuid(1), uuid(2)]);
  });

  it("repeats nobody, so a stream is nudged once per fan-out", () => {
    expect(JSON.parse(notificationMessages([uuid(1), uuid(1)])[0])).toEqual([
      uuid(1),
    ]);
  });

  it("slices a fan-out to everyone, and loses no one on the way", () => {
    const ids = Array.from({ length: 250 }, (_, index) => uuid(index));
    const messages = notificationMessages(ids);

    expect(messages).toHaveLength(3);
    for (const message of messages) {
      // Comfortably inside the 8000 byte ceiling, whatever the encoding.
      expect(message.length).toBeLessThan(4000);
    }
    expect(messages.flatMap((message) => JSON.parse(message))).toEqual(ids);
  });
});
