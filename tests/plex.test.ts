import { describe, expect, it } from "vitest";

import { itemsFrom, sectionId } from "@/lib/providers/plex";

describe("library parsing", () => {
  it("reads a movie and its provider mappings", () => {
    const items = itemsFrom(
      {
        MediaContainer: {
          Metadata: [
            {
              ratingKey: "1234",
              type: "movie",
              title: "Blade Runner 2049",
              year: 2017,
              addedAt: 1700000000,
              Guid: [{ id: "tmdb://335984" }, { id: "imdb://tt1856101" }],
            },
          ],
        },
      },
      "1",
    );

    expect(items).toHaveLength(1);
    expect(items[0].tmdbId).toBe("335984");
    expect(items[0].imdbId).toBe("tt1856101");
    expect(items[0].addedAt?.getTime()).toBe(1700000000 * 1000);
  });

  it("reads attributes prefixed by the XML to JSON conversion", () => {
    const items = itemsFrom(
      {
        MediaContainer: {
          Metadata: {
            "@ratingKey": "42",
            "@type": "episode",
            "@title": "Aussa the mage",
            "@grandparentTitle": "Frieren",
            "@grandparentRatingKey": "10",
            "@parentIndex": "2",
            "@index": "9",
            "@guid": "com.plexapp.agents.thetvdb://389755/2/9?lang=en",
          },
        },
      },
      null,
    );

    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe("episode");
    expect(items[0].seasonNumber).toBe(2);
    expect(items[0].episodeNumber).toBe(9);
    expect(items[0].tvdbId).toBe("389755");
    expect(items[0].grandparentTitle).toBe("Frieren");
  });

  it("ignores entries of an unknown kind", () => {
    const items = itemsFrom(
      {
        MediaContainer: {
          Metadata: [{ ratingKey: "1", type: "artist", title: "X" }],
        },
      },
      null,
    );
    expect(items).toHaveLength(0);
  });

  it("refuses a section key that is not numeric", () => {
    expect(() => sectionId("../../secret")).toThrow();
    expect(sectionId("3")).toBe(3);
  });
});
