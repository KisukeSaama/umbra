import { describe, expect, it } from "vitest";

import { bulkNote } from "@/lib/domain/queue-moves";
import {
  BULK_MOVES,
  bulkAskTarget,
  bulkMovesFor,
  bulkRequestTarget,
} from "@/lib/queue";
import { canTransition } from "@/lib/reports/reasons";

/**
 * Several rows of the request queue moved at once. The moves themselves are
 * the rows' own; what is pinned here is how one gesture maps onto two tables,
 * and what the one word typed does to rows that each had their own.
 */
describe("a move made on a selection", () => {
  it("sends a request where its own buttons would", () => {
    expect(bulkRequestTarget("accept")).toBe("accepted");
    expect(bulkRequestTarget("reject")).toBe("rejected");
    expect(bulkRequestTarget("reopen")).toBe("requested");
  });

  it("sends an ask along the ask path, from where each move starts", () => {
    const place = { seasonNumber: 2, episodeNumber: null, hasCalendar: true };
    expect(
      canTransition("open", bulkAskTarget("accept"), "missing_season", place),
    ).toBe(true);
    expect(
      canTransition("open", bulkAskTarget("reject"), "missing_season", place),
    ).toBe(true);
    expect(
      canTransition(
        "rejected",
        bulkAskTarget("reopen"),
        "missing_season",
        place,
      ),
    ).toBe(true);
  });

  it("offers a move as soon as one ticked row can take it, with its reach", () => {
    expect(
      bulkMovesFor([
        { moves: ["accept", "reject"] },
        { moves: ["reject"] },
        { moves: ["reopen"] },
      ]),
    ).toEqual([
      { move: "accept", count: 1 },
      { move: "reject", count: 2 },
      { move: "reopen", count: 1 },
    ]);
  });

  it("offers nothing a selection of settled rows cannot take", () => {
    expect(bulkMovesFor([{ moves: [] }, { moves: [] }])).toEqual([]);
  });

  it("lists the moves in a fixed order, whatever was ticked first", () => {
    const moves = bulkMovesFor([{ moves: ["reopen", "accept"] }]).map(
      ({ move }) => move,
    );
    expect(moves).toEqual(BULK_MOVES.filter((move) => moves.includes(move)));
  });
});

describe("the word sent with a selection", () => {
  it("leaves every row's own word alone when accepting with an empty box", () => {
    expect(bulkNote("accept", null)).toBeUndefined();
    expect(bulkNote("accept", "   ")).toBeUndefined();
    expect(bulkNote("accept", undefined)).toBeUndefined();
  });

  it("gives every accepted row the word typed, trimmed", () => {
    expect(bulkNote("accept", "  found tonight ")).toBe("found tonight");
  });

  it("clears the word on a refusal left empty, as a row does", () => {
    expect(bulkNote("reject", null)).toBeNull();
    expect(bulkNote("reject", "")).toBeNull();
    expect(bulkNote("reject", " not findable ")).toBe("not findable");
  });

  it("says nothing on a reopening", () => {
    expect(bulkNote("reopen", "anything")).toBeUndefined();
  });
});
