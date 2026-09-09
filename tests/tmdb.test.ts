import { describe, expect, it } from "vitest";

import {
  discoverParams,
  episodeFromJson,
  numericId,
  summaryFromJson,
} from "@/lib/providers/tmdb";

describe("tmdb parsing", () => {
  it("reads a movie row from a multi search", () => {
    const summary = summaryFromJson({
      id: 335984,
      media_type: "movie",
      title: "Blade Runner 2049",
      original_title: "Blade Runner 2049",
      release_date: "2017-10-04",
      poster_path: "/poster.jpg",
      popularity: 42.5,
    });

    expect(summary).not.toBeNull();
    expect(summary?.providerId).toBe("335984");
    expect(summary?.kind).toBe("movie");
    expect(summary?.releaseDate).toBe("2017-10-04");
    // A title identical to the original adds nothing on screen.
    expect(summary?.originalTitle).toBeNull();
  });

  it("keeps an original title that differs", () => {
    const summary = summaryFromJson({
      id: 209867,
      media_type: "tv",
      name: "Frieren",
      original_name: "Sousou no Frieren",
      first_air_date: "2023-09-29",
    });

    expect(summary?.kind).toBe("tv");
    expect(summary?.originalTitle).toBe("Sousou no Frieren");
  });

  it("reads the score, and tells a missing one from a zero", () => {
    const rated = summaryFromJson({
      id: 1,
      media_type: "movie",
      title: "Seven",
      vote_average: 8.4,
      vote_count: 20000,
    });
    const unrated = summaryFromJson({
      id: 2,
      media_type: "movie",
      title: "Unseen",
    });

    expect(rated?.voteAverage).toBe(8.4);
    expect(rated?.voteCount).toBe(20000);
    // Null, not zero: the library index leans on that difference to know the
    // row has not been looked at yet.
    expect(unrated?.voteAverage).toBeNull();
    expect(unrated?.voteCount).toBe(0);
  });

  it("ignores rows that are not media", () => {
    expect(
      summaryFromJson({ id: 1, media_type: "person", name: "Denis" }),
    ).toBeNull();
    expect(summaryFromJson(null)).toBeNull();
  });

  it("reads an episode", () => {
    const episode = episodeFromJson({
      id: 4567,
      season_number: 2,
      episode_number: 9,
      name: "The turning point",
      air_date: "2026-09-13",
    });

    expect(episode).toEqual({
      providerEpisodeId: "4567",
      seasonNumber: 2,
      episodeNumber: 9,
      title: "The turning point",
      airDate: "2026-09-13",
    });
  });

  it("refuses an identifier that is not numeric", () => {
    expect(() => numericId("../secret")).toThrow();
    expect(numericId("42")).toBe(42);
  });
});

describe("discover filters", () => {
  it("holds a score floor under every listing", () => {
    const movie = discoverParams({ kind: "movie", sortBy: "rating" });
    const show = discoverParams({ kind: "tv", sortBy: "popularity" });

    // The floor is a property of the query, not of the sort: a shelf ordered
    // by popularity is a suggestion too.
    expect(movie["vote_average.gte"]).toBe(6.5);
    expect(show["vote_average.gte"]).toBe(6.5);
  });

  it("keeps the score floor when the vote count is given up", () => {
    const relaxed = discoverParams({
      kind: "tv",
      sortBy: "rating",
      voteCountGte: 100,
    });

    expect(relaxed["vote_count.gte"]).toBe(100);
    expect(relaxed["vote_average.gte"]).toBe(6.5);
  });

  it("lets a caller ask for more than the floor", () => {
    expect(
      discoverParams({ kind: "movie", voteAverageGte: 7.5 })[
        "vote_average.gte"
      ],
    ).toBe(7.5);
  });

  it("counts votes differently on each side", () => {
    expect(
      discoverParams({ kind: "movie", sortBy: "rating" })["vote_count.gte"],
    ).toBe(1000);
    expect(
      discoverParams({ kind: "tv", sortBy: "rating" })["vote_count.gte"],
    ).toBe(600);
  });
});
