import { describe, expect, it } from "vitest";

import { bulkNote } from "@/lib/domain/queue-moves";
import { canMoveRequest } from "@/lib/domain/requests";
import {
  BULK_MOVES,
  bulkAskTarget,
  bulkMovesFor,
  bulkRequestTarget,
  type BulkMove,
} from "@/lib/queue";
import { canTransition } from "@/lib/reports/reasons";

/** Where a move sends an ask, for a move an ask can take. */
function askTarget(move: BulkMove) {
  const target = bulkAskTarget(move);
  if (target === null) throw new Error(`an ask cannot take ${move}`);
  return target;
}

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
    expect(bulkRequestTarget("postpone")).toBe("postponed");
  });

  it("never puts off an ask: a season asked for has no such step", () => {
    expect(bulkAskTarget("postpone")).toBeNull();
  });

  it("sends an ask along the ask path, from where each move starts", () => {
    const place = { seasonNumber: 2, episodeNumber: null, hasCalendar: true };
    expect(
      canTransition("open", askTarget("accept"), "missing_season", place),
    ).toBe(true);
    expect(
      canTransition("open", askTarget("reject"), "missing_season", place),
    ).toBe(true);
    expect(
      canTransition("rejected", askTarget("reopen"), "missing_season", place),
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

  it("sends the word typed when putting off, and nothing on an empty box", () => {
    expect(bulkNote("postpone", "")).toBeNull();
    expect(bulkNote("postpone", " next month ")).toBe("next month");
  });

  it("says nothing on a reopening", () => {
    expect(bulkNote("reopen", "anything")).toBeUndefined();
  });
});

/**
 * A request put off until there is room keeps its place as the title's one
 * live request, and leaves that place only by being decided again.
 */
describe("a request put off until there is room", () => {
  it("can be put off before or after being taken up", () => {
    expect(canMoveRequest("requested", "postponed")).toBe(true);
    expect(canMoveRequest("accepted", "postponed")).toBe(true);
  });

  it("comes back by being accepted, or goes by being refused", () => {
    expect(canMoveRequest("postponed", "accepted")).toBe(true);
    expect(canMoveRequest("postponed", "rejected")).toBe(true);
  });

  it("is never declared on the server or reopened by hand", () => {
    expect(canMoveRequest("postponed", "available")).toBe(false);
    expect(canMoveRequest("postponed", "requested")).toBe(false);
    expect(canMoveRequest("rejected", "postponed")).toBe(false);
  });
});
