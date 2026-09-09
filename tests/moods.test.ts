import { describe, expect, it } from "vitest";

import {
  DURATIONS,
  discoverQueriesFor,
  FORMATS,
  genresFor,
  isDuration,
  isFormat,
  isMood,
  kindsFor,
  MOODS,
  SHORT_RUNTIME_MINUTES,
} from "@/lib/discovery/moods";

/**
 * The guided picker is the only place Umbra turns a feeling into a query, and
 * the mistakes it can make are silent: a wrong genre id returns an empty shelf
 * rather than an error, so these are the cases worth pinning down.
 */

/** Genre ids the provider defines for films. */
const MOVIE_GENRE_IDS = new Set([
  28, 12, 16, 35, 80, 99, 18, 10751, 14, 36, 27, 10402, 9648, 10749, 878, 10770,
  53, 10752, 37,
]);

/** Genre ids the provider defines for shows. They are not the same numbers. */
const TV_GENRE_IDS = new Set([
  10759, 16, 35, 80, 99, 18, 10751, 10762, 9648, 10763, 10764, 10765, 10766,
  10767, 10768, 37,
]);

describe("mood mapping", () => {
  it("only ever emits ids that exist in the space it is asking", () => {
    // Films and shows number their genres differently, and mixing them is the
    // bug this whole per-kind table exists to prevent: 28 means Action on a
    // film and nothing at all on a show.
    for (const mood of MOODS) {
      for (const id of genresFor(mood, "movie"))
        expect(MOVIE_GENRE_IDS.has(id), `${mood} movie ${id}`).toBe(true);
      for (const id of genresFor(mood, "tv"))
        expect(TV_GENRE_IDS.has(id), `${mood} tv ${id}`).toBe(true);
    }
  });

  it("gives every mood something to ask for on both sides", () => {
    for (const mood of MOODS) {
      expect(genresFor(mood, "movie").length).toBeGreaterThan(0);
      expect(genresFor(mood, "tv").length).toBeGreaterThan(0);
    }
  });

  it("caps the runtime for a film and never for a show", () => {
    // On a show the same parameter filters the length of one episode, which is
    // a different question and quietly empties the shelf.
    const film = discoverQueriesFor({
      mood: "laugh",
      format: "movie",
      duration: "short",
    });
    expect(film[0].runtimeLte).toBe(SHORT_RUNTIME_MINUTES);

    const show = discoverQueriesFor({
      mood: "laugh",
      format: "series",
      duration: "short",
    });
    expect(show[0].runtimeLte).toBeUndefined();
  });

  it("asks both sides when the answer was surprise me", () => {
    expect(kindsFor("either")).toEqual(["movie", "tv"]);
    const queries = discoverQueriesFor({
      mood: "adventure",
      format: "either",
      duration: "any",
    });
    expect(queries.map((query) => query.kind)).toEqual(["movie", "tv"]);
  });

  it("refuses anything outside the closed sets", () => {
    // The interface only offers these, but the route validates them again:
    // a closed set is only closed if the boundary says so.
    expect(isMood("thrill")).toBe(true);
    expect(isMood("whatever")).toBe(false);
    expect(isFormat(FORMATS[0])).toBe(true);
    expect(isFormat("")).toBe(false);
    expect(isDuration(DURATIONS[0])).toBe(true);
    expect(isDuration(null)).toBe(false);
  });
});
