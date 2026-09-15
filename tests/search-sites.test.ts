import { describe, expect, it } from "vitest";

import {
  buildSearchUrl,
  isValidSearchUrl,
  searchableTitle,
  searchLinksFor,
  searchQuery,
  type SearchSiteConfig,
  type SearchSiteView,
} from "@/lib/search-sites";

const site: SearchSiteConfig = {
  name: "Example",
  url: "https://example.org/search",
  queryParam: "q",
  params: [{ key: "category", value: "movies" }],
};

const configured = (over: Partial<SearchSiteView> = {}): SearchSiteView => ({
  ...site,
  id: "one",
  position: 0,
  enabled: true,
  ...over,
});

describe("searchQuery", () => {
  it("searches a movie by its title and year", () => {
    expect(searchQuery({ kind: "movie", title: "Dune", year: 2021 })).toBe(
      "Dune 2021",
    );
    expect(searchQuery({ kind: "movie", title: "Dune" })).toBe("Dune");
  });

  it("does not repeat a year the title already ends with", () => {
    expect(searchQuery({ kind: "movie", title: "1917", year: 1917 })).toBe(
      "1917",
    );
  });

  it("searches an episode by its code and a season by its number", () => {
    const show = { kind: "tv", title: "Severance", year: 2022 } as const;
    expect(searchQuery({ ...show, season: 1, episode: 2 })).toBe(
      "Severance S01E02",
    );
    expect(searchQuery({ ...show, season: 10 })).toBe("Severance S10");
  });

  it("leaves the year out of a series", () => {
    expect(searchQuery({ kind: "tv", title: "Severance", year: 2022 })).toBe(
      "Severance",
    );
  });
});

describe("searchableTitle", () => {
  it("spells the title the way a release does", () => {
    expect(searchableTitle("Dune: Part Two")).toBe("Dune Part Two");
    expect(searchableTitle("Grey's Anatomy")).toBe("Greys Anatomy");
    expect(searchableTitle("Le Fabuleux Destin d’Amélie Poulain")).toBe(
      "Le Fabuleux Destin dAmelie Poulain",
    );
    expect(searchableTitle("Law & Order")).toBe("Law Order");
  });
});

describe("buildSearchUrl", () => {
  it("carries the fixed arguments and then the search", () => {
    expect(
      buildSearchUrl(site, { kind: "movie", title: "Dune", year: 2021 }),
    ).toBe("https://example.org/search?category=movies&q=Dune+2021");
  });

  it("keeps what the saved address already carries", () => {
    expect(
      buildSearchUrl(
        { ...site, url: "https://example.org/search?lang=fr", params: [] },
        { kind: "movie", title: "Dune" },
      ),
    ).toBe("https://example.org/search?lang=fr&q=Dune");
  });

  it("refuses an address a browser has no business following", () => {
    expect(
      buildSearchUrl(
        { ...site, url: "javascript:alert(1)" },
        { kind: "movie", title: "x" },
      ),
    ).toBeNull();
    expect(isValidSearchUrl("example.org")).toBe(false);
    expect(isValidSearchUrl("https://example.org")).toBe(true);
  });
});

describe("searchLinksFor", () => {
  it("keeps the configured order and leaves out what cannot be built", () => {
    const links = searchLinksFor(
      [
        configured({ id: "first", name: "First" }),
        configured({ id: "broken", name: "Broken", url: "not a url" }),
        configured({ id: "second", name: "Second" }),
      ],
      { kind: "movie", title: "Dune" },
    );
    expect(links.map((link) => link.id)).toEqual(["first", "second"]);
  });
});
