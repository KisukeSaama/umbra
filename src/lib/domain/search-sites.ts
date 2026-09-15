import "server-only";

import { asc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { isUniqueViolation } from "@/lib/db/errors";
import { searchSites } from "@/lib/db/schema";
import { BadRequestError, ConflictError, NotFoundError } from "@/lib/errors";
import {
  isValidSearchUrl,
  type SearchLink,
  type SearchSiteParam,
  type SearchSiteView,
} from "@/lib/search-sites";

/**
 * Search sites, as the administration keeps them.
 *
 * There can be as many as the work needs, and their order is the only thing
 * that ranks them: the first enabled site is the one on the button of every
 * request and every report, the rest sit in the list next to it.
 *
 * Uniqueness of the name is carried by a unique index rather than by a read
 * before the write, as everywhere else here.
 */

export type { SearchLink, SearchSiteView };

export type SearchSiteInput = {
  name: string;
  url: string;
  queryParam: string;
  params: SearchSiteParam[];
  position: number;
  enabled: boolean;
};

const columns = {
  id: searchSites.id,
  name: searchSites.name,
  url: searchSites.url,
  queryParam: searchSites.queryParam,
  params: searchSites.params,
  position: searchSites.position,
  enabled: searchSites.enabled,
};

/** Every site, disabled ones included: this is what the settings page shows. */
export async function listSearchSites(): Promise<SearchSiteView[]> {
  return db()
    .select(columns)
    .from(searchSites)
    .orderBy(asc(searchSites.position), asc(searchSites.name));
}

/** The sites the queues offer, in the order their buttons appear. */
export async function listEnabledSearchSites(): Promise<SearchSiteView[]> {
  return db()
    .select(columns)
    .from(searchSites)
    .where(eq(searchSites.enabled, true))
    .orderBy(asc(searchSites.position), asc(searchSites.name));
}

export async function createSearchSite(input: SearchSiteInput) {
  try {
    const [row] = await db()
      .insert(searchSites)
      .values(normalise(input))
      .returning({ id: searchSites.id });
    return row;
  } catch (error) {
    if (isUniqueViolation(error))
      throw new ConflictError("error.searchSiteName");
    throw error;
  }
}

export async function updateSearchSite(
  id: string,
  input: Partial<SearchSiteInput>,
) {
  const values = normalise(input);
  let row: { id: string } | undefined;
  try {
    [row] = await db()
      .update(searchSites)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(searchSites.id, id))
      .returning({ id: searchSites.id });
  } catch (error) {
    if (isUniqueViolation(error))
      throw new ConflictError("error.searchSiteName");
    throw error;
  }
  if (!row) throw new NotFoundError("error.searchSiteNotFound");
  return row;
}

export async function deleteSearchSite(id: string) {
  const [row] = await db()
    .delete(searchSites)
    .where(eq(searchSites.id, id))
    .returning({ id: searchSites.id });
  if (!row) throw new NotFoundError("error.searchSiteNotFound");
  return row;
}

/**
 * Trims what the form sent, drops the nameless arguments, and refuses an
 * address a browser has no business following.
 */
function normalise<T extends Partial<SearchSiteInput>>(input: T) {
  if (input.url !== undefined && !isValidSearchUrl(input.url))
    throw new BadRequestError("error.searchSiteUrl");

  return {
    ...input,
    ...(input.name === undefined ? {} : { name: input.name.trim() }),
    ...(input.url === undefined ? {} : { url: input.url.trim() }),
    ...(input.queryParam === undefined
      ? {}
      : { queryParam: input.queryParam.trim() }),
    ...(input.params === undefined
      ? {}
      : {
          params: input.params
            .map((param) => ({
              key: param.key.trim(),
              value: param.value.trim(),
            }))
            .filter((param) => param.key.length > 0),
        }),
  };
}
