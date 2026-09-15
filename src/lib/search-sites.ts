/**
 * Links that open a search the administration runs elsewhere.
 *
 * Fetching a title starts on somebody else's search page, and the typing that
 * gets there is always the same: the title, sometimes the year, sometimes the
 * season and the episode. A search site is that page written down once, as an
 * address, the GET argument carrying the search terms and any number of fixed
 * arguments, so the queues can offer a link instead of a copy and paste.
 *
 * Umbra never calls those pages: it builds the address and the browser opens
 * it, which is why this module is pure and knows nothing about the database.
 * Nothing here goes through Janus either, because nothing here is a request.
 */

/** A GET argument whose value is fixed by the configuration. */
export type SearchSiteParam = { key: string; value: string };

/** Everything needed to turn a title into a link. */
export type SearchSiteConfig = {
  name: string;
  url: string;
  /** Name of the GET argument carrying the search terms. */
  queryParam: string;
  /** Template of those terms, for instance `{title} {year}`. */
  queryTemplate: string;
  params: SearchSiteParam[];
};

/** A configured site, as the admin screens read it. */
export type SearchSiteView = SearchSiteConfig & {
  id: string;
  position: number;
  enabled: boolean;
};

/** One site, aimed at one title, ready to open. */
export type SearchLink = { id: string; name: string; url: string };

/** What is being looked for. Everything but the title is optional. */
export type SearchTarget = {
  title: string;
  year?: number | null;
  season?: number | null;
  episode?: number | null;
};

/** What a template may name. Anything else is left alone. */
export const SEARCH_PLACEHOLDERS = [
  "title",
  "year",
  "season",
  "episode",
  "season2",
  "episode2",
  "code",
] as const;

export type SearchPlaceholder = (typeof SEARCH_PLACEHOLDERS)[number];

export const DEFAULT_QUERY_TEMPLATE = "{title} {year}";

const pad = (value: number) => String(value).padStart(2, "0");

/**
 * Fills a template.
 *
 * A value the title does not have becomes nothing rather than the placeholder
 * itself: a movie searched as "Dune {season}" finds nothing at all, and the
 * whitespace left behind is closed up so the terms read as they were meant to.
 */
export function renderQuery(template: string, target: SearchTarget): string {
  const { title, year, season, episode } = target;
  const values: Record<SearchPlaceholder, string> = {
    title: title.trim(),
    year: year ? String(year) : "",
    season: season != null ? String(season) : "",
    episode: episode != null ? String(episode) : "",
    season2: season != null ? pad(season) : "",
    episode2: episode != null ? pad(episode) : "",
    code:
      season != null && episode != null
        ? `S${pad(season)}E${pad(episode)}`
        : "",
  };

  return template
    .replace(/\{(\w+)\}/g, (match, name: string) =>
      name in values ? values[name as SearchPlaceholder] : match,
    )
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * An absolute http(s) address, the only thing worth opening in a tab.
 *
 * Checked here rather than only in the form: what the administrator saved once
 * is what the queues hand to the browser afterwards.
 */
export function isValidSearchUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * The complete link for one title.
 *
 * The fixed arguments are applied first and the search last, so a configuration
 * naming the search argument twice can never lose the terms. Whatever the saved
 * address already carries is kept.
 *
 * Answers `null` when the address is not one a browser should follow.
 */
export function buildSearchUrl(
  site: SearchSiteConfig,
  target: SearchTarget,
): string | null {
  if (!isValidSearchUrl(site.url)) return null;

  const url = new URL(site.url);
  for (const param of site.params) {
    if (!param.key.trim()) continue;
    url.searchParams.set(param.key, param.value);
  }
  url.searchParams.set(
    site.queryParam,
    renderQuery(site.queryTemplate, target),
  );

  return url.toString();
}

/** The sites that can be opened for one title, in their configured order. */
export function searchLinksFor(
  sites: SearchSiteView[],
  target: SearchTarget,
): SearchLink[] {
  return sites.flatMap((site) => {
    const url = buildSearchUrl(site, target);
    return url ? [{ id: site.id, name: site.name, url }] : [];
  });
}
