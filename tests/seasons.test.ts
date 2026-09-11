import { describe, expect, it } from "vitest";

import type { SeasonState } from "@/lib/domain/catalog";
import {
  isSeasonComplete,
  isSeasonMissing,
  isSeasonReleased,
  isSeriesIncomplete,
  isUnaired,
  seasonShortfall,
} from "@/lib/domain/seasons";
import { formatEpisodeRuns } from "@/lib/format";

describe("episode runs", () => {
  it("spells runs the way an indexer is searched", () => {
    expect(
      formatEpisodeRuns(1, [
        [25, 48],
        [50, 50],
      ]),
    ).toBe("S01E25-S01E48, S01E50");
  });
});

describe("season shortfall", () => {
  const now = new Date("2026-09-11T12:00:00Z");
  const episode = (
    episodeNumber: number,
    onServer: boolean,
    airDate: string | null = "2026-01-01",
  ) => ({ episodeNumber, onServer, airDate });

  it("counts what has aired and is not here, folded into runs", () => {
    const result = seasonShortfall(
      [
        episode(1, true),
        episode(2, false),
        episode(3, false),
        episode(4, true),
        episode(5, false),
        episode(6, false, "2026-12-01"),
      ],
      now,
    );
    expect(result).toEqual({
      aired: 5,
      missing: 3,
      runs: [
        [2, 3],
        [5, 5],
      ],
    });
  });

  it("finds nothing short when everything aired is here", () => {
    expect(
      seasonShortfall([episode(1, true), episode(2, false, "2027-01-01")], now)
        .missing,
    ).toBe(0);
  });
});

function season(partial: Partial<SeasonState>): SeasonState {
  return {
    seasonNumber: 1,
    episodeCount: 10,
    airDate: null,
    onServer: 10,
    ...partial,
  };
}

describe("season completeness", () => {
  it("counts a season with every listed episode as complete", () => {
    expect(isSeasonComplete(season({ episodeCount: 10, onServer: 10 }))).toBe(
      true,
    );
  });

  it("counts a season the server holds more of than listed as complete", () => {
    expect(isSeasonComplete(season({ episodeCount: 10, onServer: 12 }))).toBe(
      true,
    );
  });

  it("counts a partly held season as incomplete", () => {
    expect(isSeasonComplete(season({ episodeCount: 10, onServer: 4 }))).toBe(
      false,
    );
  });

  it("judges an unnumbered season on what the server holds", () => {
    expect(isSeasonComplete(season({ episodeCount: 0, onServer: 3 }))).toBe(
      true,
    );
    expect(isSeasonComplete(season({ episodeCount: 0, onServer: 0 }))).toBe(
      false,
    );
  });

  it("knows a season that is not there at all", () => {
    expect(isSeasonMissing(season({ onServer: 0 }))).toBe(true);
    expect(isSeasonMissing(season({ onServer: 1 }))).toBe(false);
  });
});

describe("series completeness", () => {
  it("is incomplete when one season falls short", () => {
    expect(
      isSeriesIncomplete([
        season({ seasonNumber: 1, onServer: 10 }),
        season({ seasonNumber: 2, onServer: 4 }),
      ]),
    ).toBe(true);
  });

  it("is complete when every season is there", () => {
    expect(
      isSeriesIncomplete([
        season({ seasonNumber: 1 }),
        season({ seasonNumber: 2 }),
      ]),
    ).toBe(false);
  });

  it("says nothing about a series whose seasons are unknown", () => {
    expect(isSeriesIncomplete([])).toBe(false);
  });

  it("does not count a season only announced as a shortfall", () => {
    expect(
      isSeriesIncomplete([
        season({ seasonNumber: 1, airDate: "2024-01-05" }),
        season({ seasonNumber: 2, episodeCount: 0, onServer: 0 }),
      ]),
    ).toBe(false);
  });
});

describe("released seasons", () => {
  const now = new Date("2026-09-09T18:00:00Z");

  it("counts a dated season with episodes that has started", () => {
    expect(
      isSeasonReleased(season({ airDate: "2026-07-01", onServer: 0 }), now),
    ).toBe(true);
  });

  it("does not count a season with no episode listed", () => {
    expect(
      isSeasonReleased(
        season({ episodeCount: 0, airDate: "2026-07-01", onServer: 0 }),
        now,
      ),
    ).toBe(false);
  });

  it("does not count a season with no date", () => {
    expect(
      isSeasonReleased(season({ airDate: null, onServer: 0 }), now),
    ).toBe(false);
  });

  it("does not count a season dated in the future", () => {
    expect(
      isSeasonReleased(season({ airDate: "2026-10-01", onServer: 0 }), now),
    ).toBe(false);
  });

  it("trusts the server over the provider", () => {
    expect(
      isSeasonReleased(
        season({ episodeCount: 0, airDate: null, onServer: 2 }),
        now,
      ),
    ).toBe(true);
  });
});

describe("unaired episodes", () => {
  const now = new Date("2026-09-09T18:00:00Z");

  it("counts a date still to come", () => {
    expect(isUnaired("2026-09-16", now)).toBe(true);
  });

  it("does not count a date already past", () => {
    expect(isUnaired("2026-09-02", now)).toBe(false);
  });

  it("does not count the day itself, whatever the timezone", () => {
    expect(isUnaired("2026-09-09", now)).toBe(false);
  });

  it("says nothing about an episode the provider has not dated", () => {
    expect(isUnaired(null, now)).toBe(false);
  });

  /*
   * The day is what counts, not the hour. Pinning the date to noon meant the
   * page called an episode scheduled all morning while the reconciliation,
   * which asks the database for its own date, had already raised a task.
   */
  it("counts the day as aired from its first hour", () => {
    expect(isUnaired("2026-09-09", new Date("2026-09-09T00:30:00+02:00"))).toBe(
      false,
    );
  });
});
