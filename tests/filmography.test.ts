import { describe, expect, it } from "vitest";

import { crewFrom, filmography, signedBy } from "@/lib/domain/filmography";
import type {
  MediaSummary,
  PersonCredit,
  PersonRole,
} from "@/lib/providers/metadata";

function summary(
  providerId: string,
  voteCount: number,
  kind: MediaSummary["kind"] = "movie",
): MediaSummary {
  return {
    provider: "tmdb",
    providerId,
    kind,
    title: `Title ${providerId}`,
    originalTitle: null,
    overview: null,
    releaseDate: null,
    posterPath: null,
    backdropPath: null,
    popularity: 0,
    genreIds: [],
    voteAverage: null,
    voteCount,
  };
}

function credit(
  providerId: string,
  role: PersonRole,
  voteCount = 0,
): PersonCredit {
  return { summary: summary(providerId, voteCount), role };
}

describe("filmography", () => {
  it("groups by role, most seen first, one title once", () => {
    const groups = filmography(
      [
        credit("1", "cast", 10),
        credit("2", "cast", 500),
        credit("1", "cast", 10),
        credit("3", "voice", 50),
      ],
      "Acting",
    );

    expect(groups.map((group) => group.role)).toEqual(["cast", "voice"]);
    expect(groups[0].titles.map((title) => title.providerId)).toEqual([
      "2",
      "1",
    ]);
  });

  it("leads with what the person is known for", () => {
    const groups = filmography(
      [credit("1", "cast"), credit("2", "director")],
      "Directing",
    );
    expect(groups.map((group) => group.role)).toEqual(["director", "cast"]);
  });

  it("tells a film from a show carrying the same id", () => {
    const groups = filmography(
      [credit("7", "cast"), { summary: summary("7", 0, "tv"), role: "cast" }],
      null,
    );
    expect(groups[0].titles).toHaveLength(2);
  });
});

describe("signedBy", () => {
  it("keeps what they directed or created, without the title in hand", () => {
    const titles = signedBy(
      [
        credit("1", "director", 5),
        credit("2", "creator", 9),
        credit("3", "cast", 99),
        credit("4", "director", 1),
      ],
      { kind: "movie", providerId: "4" },
    );
    expect(titles.map((title) => title.providerId)).toEqual(["2", "1"]);
  });
});

describe("crewFrom", () => {
  it("makes every role in a drawn title a voice", () => {
    const crew = crewFrom(
      {
        leads: [],
        cast: [
          {
            personId: "1",
            name: "A",
            profilePath: null,
            character: "Kiki",
            voice: false,
          },
        ],
      },
      true,
    );
    expect(crew.cast[0].voice).toBe(true);
  });
});
