import { describe, expect, it } from "vitest";

import { applyReaction, EMPTY_TALLY, nextReaction } from "@/lib/reactions";

describe("nextReaction", () => {
  it("sets a thumb when none is held", () => {
    expect(nextReaction(null, "like")).toBe("like");
  });

  it("takes the thumb back when pressed again", () => {
    expect(nextReaction("dislike", "dislike")).toBeNull();
  });

  it("moves the thumb to the other side", () => {
    expect(nextReaction("like", "dislike")).toBe("dislike");
  });
});

describe("applyReaction", () => {
  it("counts a first reaction", () => {
    expect(applyReaction(EMPTY_TALLY, "like")).toEqual({
      likes: 1,
      dislikes: 0,
      own: "like",
    });
  });

  it("moves one count when a reaction changes side", () => {
    expect(
      applyReaction({ likes: 3, dislikes: 1, own: "like" }, "dislike"),
    ).toEqual({ likes: 2, dislikes: 2, own: "dislike" });
  });

  it("removes the count when the reaction is taken back", () => {
    expect(applyReaction({ likes: 1, dislikes: 4, own: "dislike" }, null)).toEqual(
      { likes: 1, dislikes: 3, own: null },
    );
  });
});
