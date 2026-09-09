import "server-only";

import { env } from "@/lib/env";
import { BadRequestError } from "@/lib/errors";
import { janus } from "@/lib/janus";
import {
  type LibraryItem,
  type LibraryKind,
  type LibrarySection,
  type MediaLibraryProvider,
  parseLibraryKind,
} from "@/lib/providers/library";

/**
 * Plex implementation, through Janus (slug `kisuflix`).
 *
 * Janus converts Plex XML to JSON; depending on that conversion an attribute
 * may arrive as `title` or as `@title`. The accessors below accept both rather
 * than betting on one.
 */

export const PLEX_PROVIDER = "plex";

type Json = Record<string, unknown>;

async function get<T = Json>(
  path: string,
  query: Record<string, string | number> = {},
) {
  return janus<T>({ slug: env().JANUS_LIBRARY_SLUG, path, query });
}

export const plexLibrary: MediaLibraryProvider = {
  name: PLEX_PROVIDER,

  async sections() {
    const body = await get("/library/sections");
    return containerRows(body, "Directory")
      .map((row): LibrarySection | null => {
        const key = attr(row, "key");
        const title = attr(row, "title");
        const kind = parseLibraryKind(attr(row, "type"));
        return key && title && kind ? { key, title, kind } : null;
      })
      .filter((section): section is LibrarySection => section !== null);
  },

  async sectionItems(sectionKey) {
    return paged(`/library/sections/${sectionId(sectionKey)}/all`, sectionKey);
  },

  async sectionEpisodes(sectionKey) {
    return paged(
      `/library/sections/${sectionId(sectionKey)}/allLeaves`,
      sectionKey,
    );
  },

  async recentlyAdded(limit) {
    const body = await get("/library/recentlyAdded", {
      "X-Plex-Container-Start": 0,
      "X-Plex-Container-Size": Math.max(1, Math.trunc(limit)),
      includeGuids: 1,
    });
    return itemsFrom(body, null);
  },
};

/**
 * Walks a library listing page by page.
 *
 * A show section can hold tens of thousands of episodes, and asking for them in
 * one response is what makes the gateway give up: the upstream call runs past
 * its own timeout and the whole sync fails. Pages keep every call small.
 */
const PAGE_SIZE = 400;
/** A safety net, so a misbehaving listing cannot loop forever. */
const MAX_PAGES = 100;

async function paged(
  path: string,
  sectionKey: string | null,
): Promise<LibraryItem[]> {
  const items: LibraryItem[] = [];

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const body = await get(path, {
      includeGuids: 1,
      "X-Plex-Container-Start": page * PAGE_SIZE,
      "X-Plex-Container-Size": PAGE_SIZE,
    });
    const batch = itemsFrom(body, sectionKey);
    items.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }

  return items;
}

/** Section keys are numeric: nothing else is ever concatenated into a path. */
export function sectionId(sectionKey: string): number {
  if (!/^\d+$/.test(sectionKey))
    throw new BadRequestError("error.invalidSection");
  return Number(sectionKey);
}

export function itemsFrom(
  body: unknown,
  sectionKey: string | null,
): LibraryItem[] {
  return containerRows(body, "Metadata")
    .map((row) => itemFromJson(row, sectionKey))
    .filter((item): item is LibraryItem => item !== null);
}

/**
 * `MediaContainer` may be wrapped, and a single-entry list may arrive outside
 * an array depending on the XML to JSON conversion.
 */
function containerRows(body: unknown, key: string): Json[] {
  if (!isJson(body)) return [];
  const container = isJson(body.MediaContainer) ? body.MediaContainer : body;
  const rows = container[key];
  if (Array.isArray(rows)) return rows.filter(isJson);
  if (isJson(rows)) return [rows];
  return [];
}

export function itemFromJson(
  row: unknown,
  sectionKey: string | null,
): LibraryItem | null {
  if (!isJson(row)) return null;
  const kind = parseLibraryKind(attr(row, "type"));
  const ratingKey = attr(row, "ratingKey");
  const title = attr(row, "title");
  if (!kind || !ratingKey || !title) return null;

  const guids = guidMap(row);
  const addedAtRaw = intAttr(row, "addedAt");

  return {
    ratingKey,
    kind,
    title,
    year: intAttr(row, "year"),
    tmdbId: guids.tmdb,
    tvdbId: guids.tvdb,
    imdbId: guids.imdb,
    parentRatingKey: attr(row, "parentRatingKey"),
    grandparentRatingKey: attr(row, "grandparentRatingKey"),
    grandparentTitle: attr(row, "grandparentTitle"),
    seasonNumber: intAttr(row, "parentIndex"),
    episodeNumber: kind === "episode" ? intAttr(row, "index") : null,
    addedAt: addedAtRaw ? new Date(addedAtRaw * 1000) : null,
    sectionKey: attr(row, "librarySectionID") ?? sectionKey,
  };
}

type Guids = { tmdb: string | null; tvdb: string | null; imdb: string | null };

/**
 * Plex exposes its mappings either in a `Guid` array or in the legacy `guid`
 * attribute left by the older agents.
 */
function guidMap(row: Json): Guids {
  const guids: Guids = { tmdb: null, tvdb: null, imdb: null };

  const absorb = (raw: string) => {
    const separator = raw.indexOf("://");
    if (separator < 0) return;
    const scheme = raw.slice(0, separator);
    const value = raw.slice(separator + 3).split(/[?/]/)[0];
    if (!value) return;

    if (
      scheme === "tmdb" ||
      scheme === "themoviedb" ||
      scheme === "com.plexapp.agents.themoviedb"
    ) {
      guids.tmdb ??= value;
    } else if (
      scheme === "tvdb" ||
      scheme === "thetvdb" ||
      scheme === "com.plexapp.agents.thetvdb"
    ) {
      guids.tvdb ??= value;
    } else if (scheme === "imdb" || scheme === "com.plexapp.agents.imdb") {
      guids.imdb ??= value;
    }
  };

  const rawGuids = row.Guid;
  const entries = Array.isArray(rawGuids)
    ? rawGuids
    : isJson(rawGuids)
      ? [rawGuids]
      : [];
  for (const entry of entries) {
    if (!isJson(entry)) continue;
    const id = attr(entry, "id");
    if (id) absorb(id);
  }

  const legacy = attr(row, "guid");
  if (legacy) absorb(legacy);

  return guids;
}

function isJson(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Reads an attribute, bare or prefixed by the XML to JSON conversion. */
function attr(row: Json, name: string): string | null {
  const raw = row[name] ?? row[`@${name}`];
  if (typeof raw === "string") return raw.length > 0 ? raw : null;
  if (typeof raw === "number" || typeof raw === "boolean") return String(raw);
  return null;
}

function intAttr(row: Json, name: string): number | null {
  const raw = attr(row, name);
  if (raw === null) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export type { LibraryKind };
