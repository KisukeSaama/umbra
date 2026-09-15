/**
 * Links that open a search the administration runs elsewhere.
 *
 * Fetching a title starts on somebody else's search page, and the typing that
 * gets there is always the same. A search site is that page written down once,
 * as an address, the GET argument carrying the search terms and any number of
 * fixed arguments, so the queues can offer a link instead of a copy and paste.
 *
 * The terms themselves are not configured: Umbra knows what is being looked
 * for, a movie, a whole series, a season or an episode, and writes the terms
 * the way release names are written for that case. See `searchQuery`.
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

/** What is being looked for. Everything but the kind and the title is optional. */
export type SearchTarget = {
  kind: "movie" | "tv";
  title: string;
  year?: number | null;
  season?: number | null;
  episode?: number | null;
};

/** What the settings page shows a site against: one of each case. */
export const SEARCH_SAMPLES: SearchTarget[] = [
  { kind: "movie", title: "Dune: Part Two", year: 2024 },
  { kind: "tv", title: "Severance", year: 2022, season: 2 },
  { kind: "tv", title: "Severance", year: 2022, season: 2, episode: 3 },
];

const pad = (value: number) => String(value).padStart(2, "0");

/**
 * The title as a release name spells it.
 *
 * Accents are folded, an apostrophe joins the letters around it ("Grey's"
 * becomes "Greys"), and every other sign becomes a space: a colon or an
 * ampersand in the terms narrows most search pages to nothing, while the words
 * alone match whatever separator the release uses.
 */
export function searchableTitle(title: string): string {
  return title
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/['’`]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * The terms for one target, written the way releases are named.
 *
 * - a movie: the title and its year, which is what tells a film from its remake
 *   and from everything else sharing the name;
 * - an episode: the title and `S01E02`;
 * - a season: the title and `S01`, which matches the season pack and, on most
 *   pages, the episodes of that season too;
 * - a whole series: the title alone.
 *
 * A series never carries its year: release names leave it out unless two shows
 * share a title, so adding it hides more than it finds. A year the title
 * already ends with is not repeated either.
 */
export function searchQuery(target: SearchTarget): string {
  const title = searchableTitle(target.title);
  const { season, episode, year } = target;

  if (target.kind === "movie") {
    return year && !title.endsWith(String(year)) ? `${title} ${year}` : title;
  }
  if (season != null && episode != null)
    return `${title} S${pad(season)}E${pad(episode)}`;
  if (season != null) return `${title} S${pad(season)}`;
  return title;
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
  url.searchParams.set(site.queryParam, searchQuery(target));

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
