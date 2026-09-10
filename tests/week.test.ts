import { describe, expect, it } from "vitest";

import { episodeFromJson } from "@/lib/providers/tmdb";
import { episodesInWeek, shiftDate, weekStatus } from "@/lib/week";

const episode = (season: number, number: number, airDate: string | null) => ({
  providerEpisodeId: null,
  seasonNumber: season,
  episodeNumber: number,
  title: null,
  airDate,
});

describe("this week", () => {
  const day = "2026-09-10";

  it("shifts a date across a month", () => {
    expect(shiftDate("2026-09-28", 7)).toBe("2026-10-05");
    expect(shiftDate("2026-03-03", -7)).toBe("2026-02-24");
  });

  it("keeps the last and the next broadcast when both fall in the week", () => {
    const found = episodesInWeek(
      {
        lastEpisode: episode(2, 4, "2026-09-05"),
        nextEpisode: episode(2, 5, "2026-09-12"),
      },
      day,
    );
    expect(found.map((e) => e.episodeNumber)).toEqual([4, 5]);
  });

  it("drops what is far away or undated", () => {
    const found = episodesInWeek(
      {
        lastEpisode: episode(1, 10, "2026-06-01"),
        nextEpisode: episode(2, 1, null),
      },
      day,
    );
    expect(found).toEqual([]);
  });

  it("counts an episode once when it is both the last and the next", () => {
    const same = episode(3, 2, day);
    expect(
      episodesInWeek({ lastEpisode: same, nextEpisode: same }, day),
    ).toHaveLength(1);
  });

  it("says where a broadcast stands", () => {
    expect(weekStatus("2026-09-08", true, day)).toBe("available");
    expect(weekStatus("2026-09-08", false, day)).toBe("aired_missing");
    expect(weekStatus(day, false, day)).toBe("aired_missing");
    expect(weekStatus("2026-09-12", false, day)).toBe("scheduled");
  });

  it("reads a missing next episode as nothing", () => {
    expect(episodeFromJson(null)).toBeNull();
    expect(
      episodeFromJson({
        id: 42,
        season_number: 2,
        episode_number: 5,
        name: "Five",
        air_date: "2026-09-12",
      })?.airDate,
    ).toBe("2026-09-12");
  });
});
