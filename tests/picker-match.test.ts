import { describe, expect, it } from "vitest";

import { sampleTop } from "@/lib/discovery/blend";
import {
  ANIMATION_GENRE_ID,
  discoverQueriesFor,
  matchesQuery,
} from "@/lib/discovery/moods";

/**
 * The picker now filters a ranking it already holds, so the filter has to read
 * a row exactly the way the provider reads the same query. A drift between the
 * two would put a horror film under "make me laugh" on one half only.
 */

const [laughFilm] = discoverQueriesFor({
  moods: ["laugh"],
  visualStyles: ["anime", "cartoon", "live"],
  format: "movie",
  duration: "any",
});

describe("reading a row against a query", () => {
  it("accepts a row carrying one included genre and none excluded", () => {
    expect(matchesQuery({ kind: "movie", genreIds: [35, 18] }, laughFilm)).toBe(
      true,
    );
  });

  it("refuses an excluded genre whatever else the row carries", () => {
    expect(matchesQuery({ kind: "movie", genreIds: [35, 27] }, laughFilm)).toBe(
      false,
    );
  });

  it("refuses a row with no included genre, and the other kind", () => {
    expect(matchesQuery({ kind: "movie", genreIds: [18] }, laughFilm)).toBe(
      false,
    );
    expect(matchesQuery({ kind: "tv", genreIds: [35] }, laughFilm)).toBe(false);
  });

  it("keeps anime to Japanese animation", () => {
    const [onlyAnime] = discoverQueriesFor({
      moods: ["adventure"],
      visualStyles: ["anime"],
      format: "movie",
      duration: "any",
    });
    const drawn = [12, ANIMATION_GENRE_ID];
    expect(
      matchesQuery(
        { kind: "movie", genreIds: drawn, originalLanguage: "ja" },
        onlyAnime,
      ),
    ).toBe(true);
    expect(
      matchesQuery(
        { kind: "movie", genreIds: drawn, originalLanguage: "en" },
        onlyAnime,
      ),
    ).toBe(false);
    expect(
      matchesQuery(
        { kind: "movie", genreIds: [12], originalLanguage: "ja" },
        onlyAnime,
      ),
    ).toBe(false);
  });

  it("leaves a length question to the provider, since a row has no runtime", () => {
    const [short] = discoverQueriesFor({
      moods: ["laugh"],
      visualStyles: ["anime", "cartoon", "live"],
      format: "movie",
      duration: "short",
    });
    expect(matchesQuery({ kind: "movie", genreIds: [35] }, short)).toBe(false);
  });
});

describe("drawing from the head of a ranking", () => {
  it("only draws among the first entries", () => {
    const list = Array.from({ length: 50 }, (_, index) => index);
    for (let run = 0; run < 20; run += 1) {
      const drawn = sampleTop(list, 3, 8);
      expect(drawn).toHaveLength(3);
      expect(drawn.every((value) => value < 8)).toBe(true);
      expect(new Set(drawn).size).toBe(3);
    }
  });

  it("returns what there is when the list is short", () => {
    expect(sampleTop([1, 2], 3, 8)).toHaveLength(2);
    expect(sampleTop([], 3, 8)).toEqual([]);
  });

  it("is ordered when the draw is not random", () => {
    expect(sampleTop([1, 2, 3, 4], 2, 4, () => 0.999)).toEqual([1, 2]);
  });
});
