import { describe, expect, it } from "vitest";

import {
  ANIMATION_GENRE_ID,
  VISUAL_STYLES,
  DURATIONS,
  discoverQueriesFor,
  excludedGenresFor,
  FORMATS,
  genresFor,
  isVisualStyle,
  isDuration,
  isFormat,
  isMood,
  kindsFor,
  MOODS,
  SHORT_RUNTIME_MINUTES,
  matchesCommitment,
  matchesQuery,
  releasedWithin,
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
    for (const mood of MOODS.filter((mood) => mood !== "any")) {
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

  it("separates anime from other animation", () => {
    const [query] = discoverQueriesFor({
      moods: ["love"],
      visualStyles: ["anime"],
      format: "movie",
      duration: "any",
    });
    expect(query.originalLanguage).toBe("ja");
    expect(query.requireGenreIds).toEqual([ANIMATION_GENRE_ID]);
    expect(query.genreIds).toEqual(genresFor("love", "movie"));

    const [cartoon] = discoverQueriesFor({
      moods: ["love"],
      visualStyles: ["cartoon"],
      format: "movie",
      duration: "any",
    });
    expect(cartoon.requireGenreIds).toEqual([ANIMATION_GENRE_ID]);
    expect(cartoon.excludeOriginalLanguages).toEqual(["ja"]);
  });

  it("refuses animation for live action", () => {
    const [query] = discoverQueriesFor({
      moods: ["drama"],
      visualStyles: ["live"],
      format: "movie",
      duration: "any",
    });
    expect(query.excludeGenreIds).toContain(ANIMATION_GENRE_ID);
    expect(query.originalLanguage).toBeUndefined();
    expect(query.requireGenreIds).toBeUndefined();
  });

  it("adds no visual filter when all three styles are selected", () => {
    const [query] = discoverQueriesFor({
      moods: ["thrill"],
      visualStyles: [...VISUAL_STYLES],
      format: "movie",
      duration: "any",
    });
    expect(query.excludeGenreIds).toEqual(excludedGenresFor("thrill", "movie"));
    expect(query.originalLanguage).toBeUndefined();
    expect(query.requireGenreIds).toBeUndefined();
  });

  it("offers every mood in all three visual styles", () => {
    const fingerprints = VISUAL_STYLES.map((visualStyle) =>
      JSON.stringify(
        discoverQueriesFor({
          moods: ["love"],
          visualStyles: [visualStyle],
          format: "either",
          duration: "any",
        }),
      ),
    );
    expect(new Set(fingerprints).size).toBe(VISUAL_STYLES.length);
  });

  it("carries the refusals into the query", () => {
    const [query] = discoverQueriesFor({
      moods: ["laugh"],
      visualStyles: [...VISUAL_STYLES],
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
      moods: ["laugh"],
      visualStyles: [...VISUAL_STYLES],
      format: "movie",
      duration: "short",
    });
    expect(film[0].runtimeLte).toBe(SHORT_RUNTIME_MINUTES);

    const show = discoverQueriesFor({
      moods: ["laugh"],
      visualStyles: [...VISUAL_STYLES],
      format: "series",
      duration: "short",
    });
    expect(show[0].runtimeLte).toBeUndefined();
  });

  it("asks both sides when the answer was surprise me", () => {
    expect(kindsFor("either")).toEqual(["movie", "tv"]);
    const queries = discoverQueriesFor({
      moods: ["adventure"],
      visualStyles: [...VISUAL_STYLES],
      format: "either",
      duration: "any",
    });
    expect(queries.map((query) => query.kind)).toEqual(["movie", "tv"]);
  });

  it("turns an era into years of first release", () => {
    const [classic] = discoverQueriesFor({
      moods: ["drama"],
      visualStyles: [...VISUAL_STYLES],
      format: "movie",
      duration: "any",
      era: "classic",
    });
    expect(classic).toMatchObject({ releasedTo: 1979 });
    expect(classic.releasedFrom).toBeUndefined();

    const [open] = discoverQueriesFor({
      moods: ["drama"],
      visualStyles: [...VISUAL_STYLES],
      format: "movie",
      duration: "any",
    });
    expect(open.releasedFrom).toBeUndefined();
    expect(open.releasedTo).toBeUndefined();
  });

  it("reads an era against a release date, and refuses an unknown one", () => {
    const modern = { releasedFrom: 1980, releasedTo: 2009 };
    expect(releasedWithin("1980-01-01", modern)).toBe(true);
    expect(releasedWithin("2009-12-31", modern)).toBe(true);
    expect(releasedWithin("1979-12-31", modern)).toBe(false);
    expect(releasedWithin(null, modern)).toBe(false);
    expect(releasedWithin(null, {})).toBe(true);
    expect(
      matchesQuery(
        { kind: "movie", genreIds: [18], releaseDate: "1954-04-26" },
        { kind: "movie", genreIds: [18], releasedFrom: 2010 },
      ),
    ).toBe(false);
  });

  it("asks for a French original or anything but English", () => {
    const [french] = discoverQueriesFor({
      moods: ["drama"],
      visualStyles: ["live"],
      format: "movie",
      duration: "any",
      origin: "french",
    });
    expect(french.originalLanguage).toBe("fr");

    const [world] = discoverQueriesFor({
      moods: ["drama"],
      visualStyles: ["cartoon"],
      format: "movie",
      duration: "any",
      origin: "world",
    });
    expect(world.excludeOriginalLanguages).toEqual(["ja", "en"]);
  });

  it("lets anime keep its own origin whatever language was asked", () => {
    const [anime] = discoverQueriesFor({
      moods: ["drama"],
      visualStyles: ["anime"],
      format: "movie",
      duration: "any",
      origin: "french",
    });
    expect(anime.originalLanguage).toBe("ja");
    expect(anime.excludeOriginalLanguages).toBeUndefined();
  });

  it("refuses anything outside the closed sets", () => {
    // The interface only offers these, but the route validates them again:
    // a closed set is only closed if the boundary says so.
    expect(isMood("thrill")).toBe(true);
    expect(isMood("whatever")).toBe(false);
    expect(isVisualStyle(VISUAL_STYLES[0])).toBe(true);
    expect(isVisualStyle("either")).toBe(false);
    expect(isFormat(FORMATS[0])).toBe(true);
    expect(isFormat("")).toBe(false);
    expect(isDuration(DURATIONS[0])).toBe(true);
    expect(isDuration(null)).toBe(false);
  });
});

describe("series commitment", () => {
  const details = {
    summary: {} as import("@/lib/providers/metadata").MediaSummary,
    status: "Ended",
    inProduction: false,
    seasons: [{ seasonNumber: 1, episodeCount: 8, airDate: null }],
  };
  it("accepts a finished short season and ignores specials", () => {
    expect(
      matchesCommitment(
        {
          ...details,
          seasons: [
            ...details.seasons,
            { seasonNumber: 0, episodeCount: 20, airDate: null },
          ],
        },
        "short",
      ),
    ).toBe(true);
  });
  it("refuses cancelled, unfinished, unknown and long stories as short", () => {
    for (const status of ["Canceled", "Returning Series", null])
      expect(matchesCommitment({ ...details, status }, "short")).toBe(false);
    expect(
      matchesCommitment(
        {
          ...details,
          seasons: [{ seasonNumber: 1, episodeCount: 12, airDate: null }],
        },
        "short",
      ),
    ).toBe(false);
    expect(matchesCommitment({ ...details, inProduction: true }, "short")).toBe(
      false,
    );
  });
  it("requires two real seasons for a longer commitment", () => {
    expect(matchesCommitment(details, "long")).toBe(false);
    expect(
      matchesCommitment(
        {
          ...details,
          seasons: [
            ...details.seasons,
            { seasonNumber: 2, episodeCount: 8, airDate: null },
          ],
        },
        "long",
      ),
    ).toBe(true);
  });
  it("does not approximate TV horror or romance with drama or mystery", () => {
    for (const [mood, keyword] of [
      ["horror", "horror"],
      ["love", "romance"],
    ] as const) {
      expect(
        discoverQueriesFor({
          moods: [mood],
          visualStyles: [...VISUAL_STYLES],
          format: "series",
          duration: "any",
        })[0],
      ).toMatchObject({ keyword, genreIds: [] });
    }
  });
});
