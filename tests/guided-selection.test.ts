import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  discover: vi.fn(),
  details: vi.fn(),
  seriesDetails: vi.fn(),
  random: vi.fn(),
  available: vi.fn(),
  genres: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  db: () => ({
    select: () => ({
      from: () => ({ where: () => ({ limit: async () => [] }) }),
    }),
  }),
}));
vi.mock("@/lib/domain/catalog", () => ({
  decorate: async (items: unknown[]) => items,
}));
vi.mock("@/lib/domain/library", () => ({
  randomAvailableByGenres: mocks.random,
  availableByProviderIds: mocks.available,
}));
vi.mock("@/lib/domain/taste", () => ({
  topGenres: mocks.genres,
  HISTORY_LIMIT: 10,
  WINDOW_DAYS: 90,
}));
vi.mock("@/lib/providers/tmdb", () => ({
  RATING_FLOOR: 6.5,
  tmdbProvider: {
    discoverBy: mocks.discover,
    details: mocks.details,
    seriesDetails: mocks.seriesDetails,
  },
}));

import { forYouShelf, guidedSelection } from "@/lib/domain/discovery";
import { plexLibrary } from "@/lib/providers/plex";

describe("guided selection constraints on both halves", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(plexLibrary, "machineIdentifier").mockResolvedValue("server-id");
    mocks.available.mockResolvedValue([]);
    mocks.random.mockResolvedValue([]);
    mocks.discover.mockResolvedValue([]);
    mocks.genres.mockResolvedValue([35]);
  });

  it.each(["movie", "series", "either"] as const)(
    "offers six titles in both sections for %s",
    async (format) => {
      mocks.random.mockImplementation(async (kind) =>
        Array.from({ length: 10 }, (_, index) => ({
          providerId: `${kind}-${index}`,
          ratingKey: `${kind}-${index}`,
        })),
      );
      mocks.discover.mockImplementation(async ({ kind }) =>
        Array.from({ length: 10 }, (_, index) => ({
          providerId: `${kind}-absent-${index}`,
          kind,
          availability: "absent",
        })),
      );
      const selection = await guidedSelection({
        moods: ["any"],
        visualStyles: ["anime", "cartoon", "live"],
        format,
        duration: "any",
      });
      expect(selection.tonight).toHaveLength(6);
      expect(selection.ideas).toHaveLength(6);
      if (format === "either") {
        expect(
          selection.tonight.filter((item) =>
            item.ratingKey.startsWith("movie"),
          ),
        ).toHaveLength(3);
      }
    },
  );

  it("fills the mixed server section even when only films are available", async () => {
    mocks.random.mockImplementation(async (kind) =>
      kind === "movie"
        ? Array.from({ length: 8 }, (_, index) => ({
            providerId: `${index}`,
            ratingKey: `${index}`,
          }))
        : [],
    );
    const selection = await guidedSelection({
      moods: ["any"],
      visualStyles: ["anime", "cartoon", "live"],
      format: "either",
      duration: "any",
    });
    expect(selection.tonight).toHaveLength(6);
    expect(selection.ideas).toHaveLength(0);
  });

  it("rejects long and unknown films even when the local index suggests them", async () => {
    mocks.random.mockResolvedValue(
      ["1", "2", "3"].map((providerId) => ({
        providerId,
        ratingKey: providerId,
      })),
    );
    mocks.discover.mockResolvedValue(
      ["4", "5"].map((providerId) => ({
        providerId,
        kind: "movie",
        availability: "absent",
      })),
    );
    mocks.details.mockImplementation(async (_kind, id) => ({
      runtime: (
        { "1": 119, "2": 120, "3": null, "4": 100, "5": 150 } as Record<
          string,
          number | null
        >
      )[id],
    }));
    const selection = await guidedSelection({
      moods: ["laugh"],
      visualStyles: ["anime", "cartoon", "live"],
      format: "movie",
      duration: "short",
    });
    expect(selection.tonight.map((item) => item.providerId)).toEqual(["1"]);
    expect(selection.tonight[0].kind).toBe("movie");
    // The listing was asked with the ceiling, so the provider filtered it and
    // its rows cost no second call against the quota.
    expect(mocks.discover).toHaveBeenCalledWith(
      expect.objectContaining({ runtimeLte: 119 }),
    );
    expect(mocks.details).not.toHaveBeenCalledWith("movie", "4", undefined);
    expect(selection.ideas.map((item) => item.providerId)).toContain("4");
  });

  it("answers a language from the index without asking the provider", async () => {
    mocks.random.mockResolvedValue([
      { providerId: "1", ratingKey: "1", originalLanguage: "fr" },
      { providerId: "2", ratingKey: "2", originalLanguage: "en" },
      { providerId: "3", ratingKey: "3", originalLanguage: "" },
      { providerId: "4", ratingKey: "4", originalLanguage: null },
    ]);
    mocks.details.mockImplementation(async (_kind, id) => ({
      originalLanguage: id === "4" ? "fr" : "en",
    }));
    const selection = await guidedSelection({
      moods: ["drama"],
      visualStyles: ["live"],
      format: "movie",
      duration: "any",
      origin: "french",
    });
    expect(
      selection.tonight.map((item) => item.providerId).sort(),
    ).toEqual(["1", "4"]);
    // Only the row the enrichment pass has not reached costs a call.
    expect(mocks.details).toHaveBeenCalledTimes(1);
    expect(mocks.random).toHaveBeenCalledWith(
      "movie",
      [18],
      12,
      [16],
      [],
      [],
      expect.objectContaining({ originalLanguage: "fr" }),
    );
  });

  it("rejects cancelled short series in both halves", async () => {
    mocks.random.mockResolvedValue(
      ["1", "2"].map((providerId) => ({ providerId, ratingKey: providerId })),
    );
    mocks.discover.mockResolvedValue(
      ["3", "4"].map((providerId) => ({
        providerId,
        kind: "tv",
        availability: "absent",
      })),
    );
    mocks.seriesDetails.mockImplementation(async (id) => ({
      status: ["1", "3"].includes(id) ? "Ended" : "Canceled",
      inProduction: false,
      seasons: [{ seasonNumber: 1, episodeCount: 8 }],
    }));
    const selection = await guidedSelection({
      moods: ["drama"],
      visualStyles: ["anime", "cartoon", "live"],
      format: "series",
      duration: "any",
      commitment: "short",
    });
    expect(selection.tonight.map((item) => item.providerId)).toEqual(["1"]);
    expect(selection.ideas.map((item) => item.providerId)).toEqual(["3"]);
  });

  it("seeds surprise listings with the account's familiar genres", async () => {
    mocks.genres.mockImplementation(async (_account, kind) =>
      kind === "movie" ? [35] : [10765],
    );
    await guidedSelection(
      {
        moods: ["any"],
        visualStyles: ["anime", "cartoon", "live"],
        format: "either",
        duration: "any",
      },
      "fr",
      "account",
      true,
    );
    expect(mocks.discover).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "movie", genreIds: [35] }),
    );
    expect(mocks.discover).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "tv", genreIds: [10765] }),
    );
  });

  it("uses the same familiar genre queries for the personal shelf and surprise", async () => {
    mocks.genres.mockImplementation(async (_account, kind) =>
      kind === "movie" ? [35] : [10765],
    );
    await forYouShelf("account", "fr");
    expect(mocks.discover).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "movie", genreIds: [35] }),
    );
    expect(mocks.discover).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "tv", genreIds: [10765] }),
    );
  });

  it("keeps the surprise fallback open when no profile exists", async () => {
    mocks.genres.mockResolvedValue([]);
    await guidedSelection(
      {
        moods: ["any"],
        visualStyles: ["anime", "cartoon", "live"],
        format: "either",
        duration: "any",
      },
      "fr",
      "account",
      true,
    );
    expect(mocks.random).toHaveBeenCalledWith("movie", [], 12, [], [], [], {});
    expect(mocks.discover).toHaveBeenCalledWith(
      expect.objectContaining({ genreIds: [] }),
    );
  });

  it("holds both halves to the era asked for", async () => {
    await guidedSelection({
      moods: ["drama"],
      visualStyles: ["live"],
      format: "movie",
      duration: "any",
      era: "classic",
    });
    expect(mocks.random).toHaveBeenCalledWith(
      "movie",
      [18],
      12,
      expect.any(Array),
      [],
      [],
      { releasedFrom: undefined, releasedTo: 1979 },
    );
    expect(mocks.discover).toHaveBeenCalledWith(
      expect.objectContaining({ releasedTo: 1979 }),
    );
  });

  it("does not repeat skipped titles while unseen Plex choices remain", async () => {
    mocks.random.mockResolvedValue(
      Array.from({ length: 7 }, (_, index) => ({
        providerId: String(index),
        ratingKey: String(index),
      })),
    );
    mocks.discover.mockResolvedValue(
      Array.from({ length: 7 }, (_, index) => ({
        providerId: String(index),
        kind: "movie",
        availability: "absent",
      })),
    );

    const selection = await guidedSelection(
      {
        moods: ["any"],
        visualStyles: ["anime", "cartoon", "live"],
        format: "movie",
        duration: "any",
      },
      "fr",
      undefined,
      false,
      new Set(["movie:0"]),
    );

    expect(selection.tonight.map((item) => item.providerId)).not.toContain("0");
    expect(selection.ideas.map((item) => item.providerId)).not.toContain("0");
  });

  it("reuses skipped Plex titles when no unseen choice remains", async () => {
    mocks.random.mockImplementation(
      async (
        _kind,
        _genres,
        _limit,
        _excludedGenres,
        _requiredGenres,
        excluded,
      ) => (excluded?.length ? [] : [{ providerId: "1", ratingKey: "1" }]),
    );

    const selection = await guidedSelection(
      {
        moods: ["any"],
        visualStyles: ["anime", "cartoon", "live"],
        format: "movie",
        duration: "any",
      },
      "fr",
      undefined,
      false,
      new Set(["movie:1"]),
    );

    expect(selection.tonight.map((item) => item.providerId)).toEqual(["1"]);
  });
});
