/**
 * Paging a list that grew too long to read in one go.
 *
 * The arithmetic lives here, away from the pages, because it is the part that
 * is easy to get wrong at the edges: an empty list still has one page, a page
 * number typed into the address bar can be anything, and asking for page nine
 * of a three page list must land on something rather than on a blank screen.
 *
 * Pages are numbered from one and carried in the query string, so a page of the
 * feed is an address that can be shared, bookmarked and reopened. Nothing here
 * touches the database or the request: it takes a total and a number, and says
 * which slice to read.
 */

export type Page = {
  /** The page being shown, clamped into the list, always at least 1. */
  page: number;
  /** How many pages the list holds, always at least 1. */
  pageCount: number;
  /** Rows to skip, ready for the query. */
  offset: number;
  perPage: number;
  total: number;
};

/**
 * Reads a page number off the query string.
 *
 * Anything that is not a whole number above zero is page one: a query string is
 * typed by hand as often as it is clicked, and a broken one is not an error
 * worth a screen of its own. A repeated parameter keeps its first value.
 */
export function parsePage(value: string | string[] | null | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return 1;

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) return 1;
  return parsed;
}

/** Where the asked page starts, once the list says how long it is. */
export function paginate(total: number, page: number, perPage: number): Page {
  const safeTotal = Math.max(0, Math.trunc(total));
  const pageCount = Math.max(1, Math.ceil(safeTotal / perPage));
  const current = Math.min(Math.max(1, Math.trunc(page)), pageCount);

  return {
    page: current,
    pageCount,
    offset: (current - 1) * perPage,
    perPage,
    total: safeTotal,
  };
}

/**
 * The address of another page of the same list.
 *
 * Every other parameter is kept, so paging out of a filtered or searched list
 * does not quietly drop what was being looked at. Page one carries no
 * parameter: the plain address and the first page are the same screen and
 * should not be two addresses.
 */
export function pageHref(
  pathname: string,
  params: URLSearchParams,
  key: string,
  page: number,
  hash?: string,
): string {
  const next = new URLSearchParams(params);
  if (page <= 1) next.delete(key);
  else next.set(key, String(page));

  const query = next.toString();
  return `${pathname}${query ? `?${query}` : ""}${hash ? `#${hash}` : ""}`;
}

/**
 * Turns what a page received into the parameters a link can be built from.
 *
 * `searchParams` arrives as a plain object where a repeated key is an array;
 * `URLSearchParams` is what the rest of this module reads.
 */
export function toSearchParams(
  params: Record<string, string | string[] | undefined>,
): URLSearchParams {
  const result = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) for (const one of value) result.append(key, one);
    else result.set(key, value);
  }
  return result;
}
