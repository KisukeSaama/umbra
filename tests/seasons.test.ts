import { describe, expect, it } from "vitest";

import type { SeasonState } from "@/lib/domain/catalog";
import {
  isSeasonComplete,
  isSeasonMissing,
  isSeriesIncomplete,
} from "@/lib/domain/seasons";

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
});
