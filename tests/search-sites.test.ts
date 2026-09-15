import { describe, expect, it } from "vitest";

import {
  buildSearchUrl,
  isValidSearchUrl,
  renderQuery,
  searchLinksFor,
  type SearchSiteConfig,
  type SearchSiteView,
} from "@/lib/search-sites";

const site: SearchSiteConfig = {
  name: "Example",
  url: "https://example.org/search",
  queryParam: "q",
  queryTemplate: "{title} {year}",
  params: [{ key: "category", value: "movies" }],
};

const configured = (over: Partial<SearchSiteView> = {}): SearchSiteView => ({
  ...site,
  id: "one",
  position: 0,
  enabled: true,
  ...over,
});

describe("renderQuery", () => {
  it("fills what the target carries", () => {
    expect(
      renderQuery("{title} {code}", { title: "Dune", season: 1, episode: 2 }),
    ).toBe("Dune S01E02");
  });

  it("drops a value the title does not have, and the gap it leaves", () => {
    expect(renderQuery("{title} {year}", { title: "Dune" })).toBe("Dune");
    expect(renderQuery("{title} S{season} E{episode}", { title: "Dune" })).toBe(
      "Dune S E",
    );
  });

  it("pads season and episode where the site expects it", () => {
    expect(
      renderQuery("{season}x{episode} {season2}-{episode2}", {
        title: "Show",
        season: 1,
        episode: 7,
      }),
    ).toBe("1x7 01-07");
  });

  it("leaves a placeholder it does not know alone", () => {
    expect(renderQuery("{title} {quality}", { title: "Dune" })).toBe(
      "Dune {quality}",
    );
  });
});

describe("buildSearchUrl", () => {
  it("carries the fixed arguments and then the search", () => {
    expect(buildSearchUrl(site, { title: "Dune", year: 2021 })).toBe(
      "https://example.org/search?category=movies&q=Dune+2021",
    );
  });

  it("keeps what the saved address already carries", () => {
    expect(
      buildSearchUrl(
        { ...site, url: "https://example.org/search?lang=fr", params: [] },
        { title: "Dune" },
      ),
    ).toBe("https://example.org/search?lang=fr&q=Dune");
  });

  it("refuses an address a browser has no business following", () => {
    expect(
      buildSearchUrl({ ...site, url: "javascript:alert(1)" }, { title: "x" }),
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
      { title: "Dune" },
    );
    expect(links.map((link) => link.id)).toEqual(["first", "second"]);
  });
});
