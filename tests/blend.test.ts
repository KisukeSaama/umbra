import { describe, expect, it } from "vitest";

import {
  blend,
  keyOf,
  MIN_VOTES,
  PER_SEED,
  RECENCY_DECAY,
  sagasOf,
  type Seed,
  seedsFrom,
  worthSuggesting,
} from "@/lib/discovery/blend";
import type { MediaKind, MediaSummary } from "@/lib/providers/metadata";

/**
 * The shelf that answers "what would I like" is arithmetic over provider lists,
 * and its mistakes are quiet: a watched film suggested back, one binge filling
 * every card, the canon winning whatever the seeds. These are the cases pinned.
 */

const FLOOR = 6.5;

describe("familiar genres", () => {
  it("filters before the shelf limit while preserving ranked familiar choices", () => {
    const shelf = blend(
      [
        {
          seed: seed("source"),
          items: [
            title("unfamiliar", { genreIds: [27] }),
            title("familiar-1", { genreIds: [35] }),
            title("familiar-2", { genreIds: [35, 18] }),
          ],
        },
      ],
      {
        watched: new Set(),
        ratingFloor: FLOOR,
        size: 2,
        accepts: (item) => item.genreIds.includes(35),
      },
    );
    expect(shelf.map((item) => item.providerId)).toEqual([
      "familiar-1",
      "familiar-2",
    ]);
  });
});

function title(
  id: string,
  over: Partial<MediaSummary> = {},
  kind: MediaKind = "movie",
): MediaSummary {
  return {
    provider: "tmdb",
    providerId: id,
    kind,
    title: `Title ${id}`,
    originalTitle: null,
    overview: null,
    releaseDate: null,
    posterPath: `/${id}.jpg`,
    backdropPath: null,
    popularity: 0,
    genreIds: [],
    voteAverage: 7.5,
    voteCount: 1000,
    ...over,
  };
}

function seed(id: string, weight = 1): Seed {
  return { kind: "movie", providerId: id, plays: 1, weight };
}

describe("seeds", () => {
  it("keeps the most recent place of a title and counts its entries", () => {
    const seeds = seedsFrom([
      { kind: "tv", providerId: "1" },
      { kind: "movie", providerId: "2" },
      { kind: "tv", providerId: "1" },
      { kind: "tv", providerId: "1" },
    ]);
    expect(seeds.map(keyOf)).toEqual(["tv:1", "movie:2"]);
    expect(seeds[0].plays).toBe(3);
    expect(seeds[1].plays).toBe(1);
  });

  it("weighs older seeds less and repeated ones more, without letting a series drown the rest", () => {
    const seeds = seedsFrom([
      { kind: "movie", providerId: "a" },
      { kind: "movie", providerId: "b" },
    ]);
    expect(seeds[1].weight).toBeCloseTo(RECENCY_DECAY);

    const binge = seedsFrom(
      Array.from({ length: 40 }, () => ({
        kind: "tv" as const,
        providerId: "s",
      })),
    );
    expect(binge[0].weight).toBeLessThan(5);
  });

  it("stops at the requested count", () => {
    const history = Array.from({ length: 30 }, (_, index) => ({
      kind: "movie" as const,
      providerId: String(index),
    }));
    expect(seedsFrom(history, 5)).toHaveLength(5);
  });

  it("does not confuse a film and a show that share a provider id", () => {
    const seeds = seedsFrom([
      { kind: "movie", providerId: "7" },
      { kind: "tv", providerId: "7" },
    ]);
    expect(seeds).toHaveLength(2);
  });
});

describe("quality bar", () => {
  it("refuses a low score, a thin vote count, an unknown score and a missing poster", () => {
    expect(worthSuggesting(title("1"), FLOOR)).toBe(true);
    expect(worthSuggesting(title("1", { voteAverage: 5.9 }), FLOOR)).toBe(
      false,
    );
    expect(
      worthSuggesting(title("1", { voteCount: MIN_VOTES - 1 }), FLOOR),
    ).toBe(false);
    expect(worthSuggesting(title("1", { voteAverage: null }), FLOOR)).toBe(
      false,
    );
    expect(worthSuggesting(title("1", { posterPath: null }), FLOOR)).toBe(
      false,
    );
  });
});

describe("blend", () => {
  it("ranks a title several seeds agree on above one a single seed placed first", () => {
    const shelf = blend(
      [
        { seed: seed("a"), items: [title("solo"), title("shared")] },
        { seed: seed("b"), items: [title("x"), title("shared")] },
        { seed: seed("c"), items: [title("y"), title("shared")] },
      ],
      { watched: new Set(), ratingFloor: FLOOR },
    );
    expect(shelf[0].providerId).toBe("shared");
  });

  it("never suggests something watched in the window", () => {
    const shelf = blend(
      [{ seed: seed("a"), items: [title("seen"), title("new")] }],
      { watched: new Set(["movie:seen"]), ratingFloor: FLOOR },
    );
    expect(shelf.map((item) => item.providerId)).toEqual(["new"]);
  });

  it("drops rows below the bar", () => {
    const shelf = blend(
      [
        {
          seed: seed("a"),
          items: [title("bad", { voteAverage: 4 }), title("good")],
        },
      ],
      { watched: new Set(), ratingFloor: FLOOR },
    );
    expect(shelf.map((item) => item.providerId)).toEqual(["good"]);
  });

  it("pulls the most voted titles back when the support is equal", () => {
    const shelf = blend(
      [
        {
          seed: seed("a"),
          items: [
            title("canon", { voteCount: 30000 }),
            title("gem", { voteCount: 400 }),
          ],
        },
        {
          seed: seed("b"),
          items: [
            title("canon", { voteCount: 30000 }),
            title("gem", { voteCount: 400 }),
          ],
        },
      ],
      { watched: new Set(), ratingFloor: FLOOR },
    );
    expect(shelf[0].providerId).toBe("gem");
  });

  it("still lets broad agreement beat the popularity pull", () => {
    const canon = title("canon", { voteCount: 30000 });
    const shelf = blend(
      [
        { seed: seed("a"), items: [canon, title("gem", { voteCount: 400 })] },
        { seed: seed("b"), items: [canon] },
        { seed: seed("c"), items: [canon] },
      ],
      { watched: new Set(), ratingFloor: FLOOR },
    );
    expect(shelf[0].providerId).toBe("canon");
  });

  it("charges no more than a few cards to one seed", () => {
    const heavy = Array.from({ length: 10 }, (_, index) => title(`h${index}`));
    const light = [title("l1"), title("l2")];
    const shelf = blend(
      [
        { seed: seed("binge", 10), items: heavy },
        { seed: seed("other", 0.1), items: light },
      ],
      { watched: new Set(), ratingFloor: FLOOR },
    );
    const fromBinge = shelf.filter((item) => item.providerId.startsWith("h"));
    expect(fromBinge).toHaveLength(PER_SEED);
    expect(shelf.map((item) => item.providerId)).toContain("l1");
  });

  it("counts a saga watched in a row as one voice", () => {
    // Three films of one saga recommend each other and all propose "echo";
    // two unrelated films both propose "agreed".
    const shelf = blend(
      [
        { seed: seed("p1"), items: [title("p2"), title("echo")] },
        { seed: seed("p2"), items: [title("p3"), title("echo")] },
        { seed: seed("p3"), items: [title("p1"), title("echo")] },
        { seed: seed("u1"), items: [title("x"), title("agreed")] },
        { seed: seed("u2"), items: [title("y"), title("agreed")] },
      ],
      {
        watched: new Set(["movie:p1", "movie:p2", "movie:p3"]),
        ratingFloor: FLOOR,
      },
    );
    expect(shelf[0].providerId).toBe("agreed");
  });

  it("joins seeds through one another's answers, and nothing else", () => {
    const groups = sagasOf([
      { seed: seed("a"), items: [title("b")] },
      { seed: seed("b"), items: [title("c")] },
      { seed: seed("c"), items: [] },
      { seed: seed("d"), items: [title("zzz")] },
    ]);
    expect(groups.get("movie:a")).toBe(groups.get("movie:c"));
    expect(groups.get("movie:d")).not.toBe(groups.get("movie:a"));
  });

  it("stops at the shelf size", () => {
    const answers = Array.from({ length: 10 }, (_, s) => ({
      seed: seed(`s${s}`),
      items: Array.from({ length: 4 }, (_, i) => title(`${s}-${i}`)),
    }));
    expect(
      blend(answers, { watched: new Set(), ratingFloor: FLOOR, size: 7 }),
    ).toHaveLength(7);
  });
});
