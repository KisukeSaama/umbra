import { describe, expect, it } from "vitest";

import {
  ANIMATION_GENRE_ID,
  ANIME_LANGUAGE,
  ANIME_STANCES,
  DURATIONS,
  discoverQueriesFor,
  excludedGenresFor,
  FORMATS,
  genresFor,
  isAnimeStance,
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

  it("only ever excludes ids that exist in the space it is asking", () => {
    // An exclusion aimed at the wrong space is the worst kind of mistake here:
    // it is accepted, it filters nothing, and the mood silently widens again.
    for (const mood of MOODS) {
      for (const id of excludedGenresFor(mood, "movie"))
        expect(MOVIE_GENRE_IDS.has(id), `${mood} movie ${id}`).toBe(true);
      for (const id of excludedGenresFor(mood, "tv"))
        expect(TV_GENRE_IDS.has(id), `${mood} tv ${id}`).toBe(true);
    }
  });

  it("never asks for a genre it also refuses", () => {
    for (const mood of MOODS) {
      for (const kind of ["movie", "tv"] as const) {
        const refused = new Set(excludedGenresFor(mood, kind));
        for (const id of genresFor(mood, kind))
          expect(refused.has(id), `${mood} ${kind} ${id}`).toBe(false);
      }
    }
  });

  it("keeps the moods apart", () => {
    // Two moods asking the same thing is a question the picker did not need to
    // ask: the member chooses between them and gets the same shelf either way.
    const fingerprints = MOODS.map((mood) =>
      (["movie", "tv"] as const)
        .map(
          (kind) =>
            `${genresFor(mood, kind).join(",")}!${excludedGenresFor(mood, kind).join(",")}`,
        )
        .join("|"),
    );
    expect(new Set(fingerprints).size).toBe(MOODS.length);
  });

  it("leaves animation entirely to the anime question", () => {
    // A mood that also had an opinion about Animation would either contradict
    // the answer to the fourth question or quietly narrow it.
    for (const mood of MOODS)
      for (const kind of ["movie", "tv"] as const) {
        expect(genresFor(mood, kind)).not.toContain(ANIMATION_GENRE_ID);
        expect(excludedGenresFor(mood, kind)).not.toContain(ANIMATION_GENRE_ID);
      }
  });

  it("pins anime to where it is made, not to how it is drawn", () => {
    // Animation is a technique. Asked for the genre alone, the shelf comes
    // back led by Pixar and DC, which is a different request entirely.
    const [query] = discoverQueriesFor({
      mood: "love",
      anime: "only",
      format: "movie",
      duration: "any",
    });
    expect(query.originalLanguage).toBe(ANIME_LANGUAGE);
    expect(query.requireGenreIds).toEqual([ANIMATION_GENRE_ID]);
    // Required, never merged into the union: a romance asked for drawn is two
    // conditions, and a union holding both would answer with either.
    expect(query.genreIds).toEqual(genresFor("love", "movie"));
  });

  it("refuses animation when the answer was no anime", () => {
    // The provider filters on a language it wants and not on one it refuses,
    // so "no anime" is read as "nothing drawn".
    const [query] = discoverQueriesFor({
      mood: "comfort",
      anime: "without",
      format: "movie",
      duration: "any",
    });
    expect(query.excludeGenreIds).toContain(ANIMATION_GENRE_ID);
    expect(query.originalLanguage).toBeUndefined();
    expect(query.requireGenreIds).toBeUndefined();
  });

  it("adds nothing at all when anime is merely welcome", () => {
    // The middle answer is the one that has to stay empty: it means the mood
    // decides on its own, drawn or filmed.
    const [query] = discoverQueriesFor({
      mood: "thrill",
      anime: "with",
      format: "movie",
      duration: "any",
    });
    expect(query.excludeGenreIds).toEqual(excludedGenresFor("thrill", "movie"));
    expect(query.originalLanguage).toBeUndefined();
    expect(query.requireGenreIds).toBeUndefined();
  });

  it("offers every mood in all three ways", () => {
    // Anime is an axis, not a shelf: each of the three answers has to give a
    // different query for the same mood, otherwise the question is decoration.
    const fingerprints = ANIME_STANCES.map((anime) =>
      JSON.stringify(
        discoverQueriesFor({
          mood: "love",
          anime,
          format: "either",
          duration: "any",
        }),
      ),
    );
    expect(new Set(fingerprints).size).toBe(ANIME_STANCES.length);
  });

  it("carries the refusals into the query", () => {
    const [query] = discoverQueriesFor({
      mood: "laugh",
      anime: "with",
      format: "movie",
      duration: "any",
    });
    // Genres are a union upstream, so without this a comedy filed under Horror
    // answers "make me laugh".
    expect(query.excludeGenreIds).toEqual(excludedGenresFor("laugh", "movie"));
    expect(query.excludeGenreIds?.length).toBeGreaterThan(0);
  });

  it("does not answer romance with drama", () => {
    // Drama used to sit in this mood, and it is what made "romance" return
    // The Godfather: nearly every serious film carries that genre.
    expect(genresFor("love", "movie")).not.toContain(18);
  });

  it("caps the runtime for a film and never for a show", () => {
    // On a show the same parameter filters the length of one episode, which is
    // a different question and quietly empties the shelf.
    const film = discoverQueriesFor({
      mood: "laugh",
      anime: "with",
      format: "movie",
      duration: "short",
    });
    expect(film[0].runtimeLte).toBe(SHORT_RUNTIME_MINUTES);

    const show = discoverQueriesFor({
      mood: "laugh",
      anime: "with",
      format: "series",
      duration: "short",
    });
    expect(show[0].runtimeLte).toBeUndefined();
  });

  it("asks both sides when the answer was surprise me", () => {
    expect(kindsFor("either")).toEqual(["movie", "tv"]);
    const queries = discoverQueriesFor({
      mood: "adventure",
      anime: "with",
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
    expect(isAnimeStance(ANIME_STANCES[0])).toBe(true);
    expect(isAnimeStance("anime")).toBe(false);
    expect(isFormat(FORMATS[0])).toBe(true);
    expect(isFormat("")).toBe(false);
    expect(isDuration(DURATIONS[0])).toBe(true);
    expect(isDuration(null)).toBe(false);
  });
});
