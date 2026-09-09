import { describe, expect, it } from "vitest";

import {
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
