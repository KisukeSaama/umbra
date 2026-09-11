import { describe, expect, it } from "vitest";

import {
  fitsMalGenres,
  isAnime,
  isAnimeQuery,
  malGenreFilter,
  matchAnime,
  mergeSimilar,
  pickTmdbMatch,
  searchableTitle,
  withMalScore,
} from "@/lib/discovery/anime";
import type {
  DiscoverQuery,
  MediaKind,
  MediaSummary,
} from "@/lib/providers/metadata";
import {
  animeRefsFromJson,
  type AnimeRef,
  recommendationsFromJson,
} from "@/lib/providers/myanimelist";

/**
 * TMDB and MyAnimeList share no id, so an anime crosses between them by title.
 * The mistakes are quiet: a recap special taken for the show, a live-action
 * adaptation shown instead of the anime, the same show twice through its
 * sequel. These are the cases pinned.
 */

function title(
  id: string,
  over: Partial<MediaSummary> = {},
  kind: MediaKind = "tv",
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
    genreIds: [16],
    originalLanguage: "ja",
    voteAverage: 8,
    voteCount: 1000,
    ...over,
  };
}

function entry(
  malId: number,
  mediaType: string,
  startDate: string | null,
): AnimeRef {
  return {
    malId,
    title: `Entry ${malId}`,
    mediaType,
    startDate,
    genres: [],
    score: null,
    scoringUsers: 0,
  };
}

describe("MAL scores", () => {
  it("takes MAL's score and its voters as they are, out of ten", () => {
    const scored = withMalScore(title("1", { voteAverage: 8.1 }), {
      score: 9.25,
      scoringUsers: 800000,
    });
    expect(scored.voteAverage).toBe(9.25);
    expect(scored.voteCount).toBe(800000);
  });

  it("keeps TMDB's score when MAL has none or was not reached", () => {
    const row = title("1", { voteAverage: 8.1, voteCount: 900 });
    expect(withMalScore(row, { score: null, scoringUsers: 0 })).toBe(row);
    expect(withMalScore(row, null)).toBe(row);
  });

  it("reads a score only within the scale", () => {
    const [good, broken] = animeRefsFromJson({
      data: [
        { node: { id: 1, title: "A", mean: 8.6, num_scoring_users: 1200 } },
        { node: { id: 2, title: "B", mean: 0 } },
      ],
    });
    expect(good.score).toBe(8.6);
    expect(good.scoringUsers).toBe(1200);
    expect(broken.score).toBeNull();
  });
});

describe("anime in the picker", () => {
  const anime: DiscoverQuery = {
    kind: "tv",
    genreIds: [35],
    requireGenreIds: [16],
    originalLanguage: "ja",
  };

  it("sends only anime queries to MAL", () => {
    expect(isAnimeQuery(anime)).toBe(true);
    expect(isAnimeQuery({ ...anime, originalLanguage: undefined })).toBe(false);
    expect(isAnimeQuery({ ...anime, requireGenreIds: [] })).toBe(false);
  });

  it("reads a mood in MAL genres, and a show keyword too", () => {
    const laugh = malGenreFilter(anime);
    expect(fitsMalGenres({ genres: ["Comedy", "School"] }, laugh)).toBe(true);
    expect(fitsMalGenres({ genres: ["Drama"] }, laugh)).toBe(false);

    const horror = malGenreFilter({ ...anime, genreIds: [], keyword: "horror" });
    expect(fitsMalGenres({ genres: ["Horror"] }, horror)).toBe(true);
    expect(fitsMalGenres({ genres: ["Comedy"] }, horror)).toBe(false);
  });

  it("lets any genre through for any mood, but keeps the exclusions", () => {
    const any = malGenreFilter({ ...anime, genreIds: [] });
    expect(fitsMalGenres({ genres: ["Sports"] }, any)).toBe(true);

    const love = malGenreFilter({
      ...anime,
      genreIds: [],
      keyword: "romance",
      excludeGenreIds: [10759],
    });
    expect(fitsMalGenres({ genres: ["Romance"] }, love)).toBe(true);
    expect(fitsMalGenres({ genres: ["Romance", "Action"] }, love)).toBe(false);
  });

  it("looks a ranked film up as a film only", () => {
    const show = title("show");
    const film = title("film", {}, "movie");
    expect(pickTmdbMatch([show, film], "movie")?.providerId).toBe("film");
    expect(pickTmdbMatch([show], "movie")).toBeNull();
  });
});

describe("what counts as anime", () => {
  it("wants a drawn title made in Japanese, not either one alone", () => {
    expect(isAnime(title("1"))).toBe(true);
    expect(isAnime(title("2", { originalLanguage: "en" }))).toBe(false);
    expect(isAnime(title("3", { genreIds: [18] }))).toBe(false);
  });
});

describe("finding the MAL entry of a TMDB title", () => {
  it("skips a special of the same name for the series", () => {
    const seed = title("13916", { releaseDate: "2006-10-03" });
    const match = matchAnime(seed, [
      entry(2994, "tv_special", "2007-08-31"),
      entry(1535, "tv", "2006-10-04"),
    ]);
    expect(match?.malId).toBe(1535);
  });

  it("does not take a remake from another decade for the original", () => {
    const seed = title("1", { releaseDate: "1999-10-20" });
    expect(matchAnime(seed, [entry(9, "tv", "2011-10-02")])).toBeNull();
  });

  it("lets a film match a film only", () => {
    const seed = title("1", { releaseDate: "2016-08-26" }, "movie");
    expect(
      matchAnime(seed, [
        entry(1, "tv", "2016-01-01"),
        entry(2, "movie", "2016-08-26"),
      ])?.malId,
    ).toBe(2);
  });

  it("accepts a web series as a show and trusts a candidate with no date", () => {
    const seed = title("1", { releaseDate: "2020-04-01" });
    expect(matchAnime(seed, [entry(3, "ona", null)])?.malId).toBe(3);
  });
});

describe("finding the TMDB title of a MAL recommendation", () => {
  it("drops the suffix MAL uses to tell two entries apart", () => {
    expect(searchableTitle("Mirai Nikki (TV)")).toBe("Mirai Nikki");
    expect(searchableTitle("Code Geass: Hangyaku no Lelouch")).toBe(
      "Code Geass: Hangyaku no Lelouch",
    );
  });

  it("refuses a live-action adaptation and prefers the show to its film", () => {
    const live = title("live", { genreIds: [18] }, "movie");
    const film = title("film", {}, "movie");
    const show = title("show");
    expect(pickTmdbMatch([live, film, show])?.providerId).toBe("show");
    expect(pickTmdbMatch([live, film])?.providerId).toBe("film");
    expect(pickTmdbMatch([live])).toBeNull();
  });
});

describe("the shelf under a title", () => {
  it("puts member picks first, fills from the provider and never repeats", () => {
    const seed = { kind: "tv" as const, providerId: "seed" };
    const shelf = mergeSimilar(
      seed,
      [title("geass"), title("geass"), title("seed")],
      [title("popular"), title("geass")],
      10,
    );
    expect(shelf.map((item) => item.providerId)).toEqual(["geass", "popular"]);
  });

  it("stops at its size", () => {
    const seed = { kind: "tv" as const, providerId: "seed" };
    const many = Array.from({ length: 30 }, (_, index) => title(`${index}`));
    expect(mergeSimilar(seed, many, [], 20)).toHaveLength(20);
  });
});

describe("myanimelist parsing", () => {
  it("reads a search answer and ignores rows without an id", () => {
    const refs = animeRefsFromJson({
      data: [
        {
          node: {
            id: 1535,
            title: "Death Note",
            media_type: "tv",
            start_date: "2006-10-04",
          },
        },
        { node: { title: "No id" } },
      ],
    });
    expect(refs).toEqual([
      {
        malId: 1535,
        title: "Death Note",
        mediaType: "tv",
        startDate: "2006-10-04",
        genres: [],
        score: null,
        scoringUsers: 0,
      },
    ]);
  });

  it("reads the genres a ranking row carries", () => {
    const [ranked] = animeRefsFromJson({
      data: [
        {
          node: {
            id: 52991,
            title: "Sousou no Frieren",
            genres: [
              { id: 2, name: "Adventure" },
              { id: 8, name: "Drama" },
            ],
          },
          ranking: { rank: 1 },
        },
      ],
    });
    expect(ranked.genres).toEqual(["Adventure", "Drama"]);
  });

  it("reads recommendations, most voted first", () => {
    const votes = recommendationsFromJson({
      recommendations: [
        { node: { id: 19, title: "Monster" }, num_recommendations: 117 },
        {
          node: { id: 1575, title: "Code Geass: Hangyaku no Lelouch" },
          num_recommendations: 646,
        },
      ],
    });
    expect(votes.map((vote) => vote.malId)).toEqual([1575, 19]);
  });

  it("returns nothing for a payload it does not recognise", () => {
    expect(recommendationsFromJson(null)).toEqual([]);
    expect(animeRefsFromJson({ data: "nope" })).toEqual([]);
  });
});
