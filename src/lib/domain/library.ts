import "server-only";

import {
  and,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
  sql,
} from "drizzle-orm";

import { db } from "@/lib/db";
import { libraryItems } from "@/lib/db/schema";
import type { LibraryItem } from "@/lib/providers/library";
import { plexLibrary } from "@/lib/providers/plex";
import { posterUrl, tmdbProvider } from "@/lib/providers/tmdb";

/**
 * Local view of the server library.
 *
 * Umbra does not mirror the whole server experience: it keeps just enough of an
 * index to answer "is it already there", to show what arrived recently, and to
 * pick something at random.
 */

/** A title on the server, reduced to what a report or a card needs. */
export type LibraryMatch = {
  ratingKey: string;
  kind: "movie" | "tv";
  providerId: string;
  title: string;
  year: number | null;
  posterUrl: string | null;
};

export type RecentItem = {
  ratingKey: string;
  /** Provider id when the media server matched the title, so a card can link. */
  providerId: string | null;
  kind: "movie" | "show" | "episode";
  title: string;
  showTitle: string | null;
  year: number | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
  posterUrl: string | null;
  addedAt: Date | null;
};

/**
 * Full library sync.
 *
 * Idempotent by design: everything is upserted on `rating_key`, then entries
 * not seen during this pass are dropped. Running it twice changes nothing,
 * running it after downtime catches everything up.
 */
export async function syncLibrary(): Promise<{
  items: number;
  episodes: number;
}> {
  const startedAt = new Date();
  const sections = await plexLibrary.sections();

  let items = 0;
  let episodeCount = 0;

  for (const section of sections) {
    const sectionItems = await plexLibrary.sectionItems(section.key);
    items += await upsertItems(sectionItems);

    if (section.kind === "show") {
      const sectionEpisodes = await plexLibrary.sectionEpisodes(section.key);
      episodeCount += await upsertItems(sectionEpisodes);
    }

    /*
     * What the server no longer holds must not keep answering "available", but
     * the sweep is scoped to the section that just answered, and only when it
     * answered with something. A section whose storage is not mounted, or one
     * read while the server is restarting, comes back empty without failing: a
     * sweep over the whole table would then erase it, and with it every request
     * and every report attached to those titles.
     */
    if (sectionItems.length > 0) {
      await db()
        .delete(libraryItems)
        .where(
          and(
            eq(libraryItems.sectionKey, section.key),
            lt(libraryItems.syncedAt, startedAt),
          ),
        );
    }
  }

  return { items, episodes: episodeCount };
}

async function upsertItems(entries: LibraryItem[]): Promise<number> {
  if (entries.length === 0) return 0;

  // Postgres caps parameters per statement, so large libraries go in chunks.
  const CHUNK = 250;
  for (let start = 0; start < entries.length; start += CHUNK) {
    const chunk = entries.slice(start, start + CHUNK);
    await db()
      .insert(libraryItems)
      .values(
        chunk.map((entry) => ({
          ratingKey: entry.ratingKey,
          kind: entry.kind,
          title: entry.title,
          year: entry.year,
          tmdbId: entry.tmdbId,
          tvdbId: entry.tvdbId,
          imdbId: entry.imdbId,
          parentRatingKey: entry.parentRatingKey,
          grandparentRatingKey: entry.grandparentRatingKey,
          grandparentTitle: entry.grandparentTitle,
          seasonNumber: entry.seasonNumber,
          episodeNumber: entry.episodeNumber,
          sectionKey: entry.sectionKey,
          addedAt: entry.addedAt,
        })),
      )
      .onConflictDoUpdate({
        target: libraryItems.ratingKey,
        set: {
          title: sql`excluded.title`,
          year: sql`excluded.year`,
          tmdbId: sql`excluded.tmdb_id`,
          tvdbId: sql`excluded.tvdb_id`,
          imdbId: sql`excluded.imdb_id`,
          parentRatingKey: sql`excluded.parent_rating_key`,
          grandparentRatingKey: sql`excluded.grandparent_rating_key`,
          grandparentTitle: sql`excluded.grandparent_title`,
          seasonNumber: sql`excluded.season_number`,
          episodeNumber: sql`excluded.episode_number`,
          sectionKey: sql`excluded.section_key`,
          addedAt: sql`excluded.added_at`,
          syncedAt: new Date(),
        },
      });
  }

  return entries.length;
}

/** Recently added, movies and shows only: an episode rail would be noise. */
export async function recentlyAdded(limit = 12): Promise<RecentItem[]> {
  const rows = await db()
    .select()
    .from(libraryItems)
    .where(inArray(libraryItems.kind, ["movie", "show"]))
    .orderBy(desc(libraryItems.addedAt))
    .limit(limit);

  return rows.map(toRecentItem);
}

/** Latest episodes added, for the admin side and the weekly summary. */
export async function recentEpisodes(limit = 12): Promise<RecentItem[]> {
  const rows = await db()
    .select()
    .from(libraryItems)
    .where(eq(libraryItems.kind, "episode"))
    .orderBy(desc(libraryItems.addedAt))
    .limit(limit);

  return rows.map(toRecentItem);
}

export async function libraryCounts() {
  const rows = await db()
    .select({ kind: libraryItems.kind, count: sql<number>`count(*)::int` })
    .from(libraryItems)
    .groupBy(libraryItems.kind);

  const counts = { movie: 0, show: 0, season: 0, episode: 0 };
  for (const row of rows) counts[row.kind] = row.count;
  return counts;
}

/** Episodes of a tracked show that the server already holds. */
export async function episodePresence(showRatingKey: string) {
  return db()
    .select({
      seasonNumber: libraryItems.seasonNumber,
      episodeNumber: libraryItems.episodeNumber,
    })
    .from(libraryItems)
    .where(
      and(
        eq(libraryItems.kind, "episode"),
        eq(libraryItems.grandparentRatingKey, showRatingKey),
      ),
    );
}

/**
 * Fills in what the media server does not say: the poster, and the genres.
 *
 * Capped per run: the point is a steady trickle after each sync, not a burst of
 * calls against the provider quota. Only titles with a known provider id can be
 * resolved, and a failure simply leaves the entry for the next run.
 *
 * Genres ride along because the details call already carries them. They are
 * what the genre shelves read and what the taste profile is built from, so they
 * cost nothing beyond a call that was happening anyway.
 */
export async function enrichLibraryPosters(limit = 120): Promise<number> {
  const rows = await db()
    .select({
      id: libraryItems.id,
      kind: libraryItems.kind,
      tmdbId: libraryItems.tmdbId,
    })
    .from(libraryItems)
    .where(
      and(
        or(isNull(libraryItems.posterPath), isNull(libraryItems.genreIds)),
        isNotNull(libraryItems.tmdbId),
        inArray(libraryItems.kind, ["movie", "show"]),
      ),
    )
    // Newest first: those are the ones on screen, so they fill in first.
    .orderBy(desc(libraryItems.addedAt))
    .limit(limit);

  let filled = 0;
  for (const row of rows) {
    if (!row.tmdbId) continue;
    try {
      const summary = await tmdbProvider.details(
        row.kind === "movie" ? "movie" : "tv",
        row.tmdbId,
      );
      await db()
        .update(libraryItems)
        .set({
          posterPath: summary.posterPath ?? undefined,
          // An empty list is still an answer: it stops the row coming back on
          // every run for a title the provider has no genres for.
          genreIds: summary.genreIds,
        })
        .where(eq(libraryItems.id, row.id));
      filled += 1;
    } catch (error) {
      console.warn(`[library] lookup failed tmdbId=${row.tmdbId}`, error);
    }
  }
  return filled;
}

/**
 * Titles on the server whose name contains what was typed.
 *
 * The only search that does not go to the provider, and the one the report flow
 * uses: you can only report something that is here, so the list to pick from is
 * the local index. Entries the media server could not match to a provider id
 * are left out, since without one there is no stable identity to attach a
 * report to.
 */
export async function searchLibrary(
  query: string,
  limit = 12,
): Promise<LibraryMatch[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const rows = await db()
    .select({
      ratingKey: libraryItems.ratingKey,
      kind: libraryItems.kind,
      title: libraryItems.title,
      year: libraryItems.year,
      tmdbId: libraryItems.tmdbId,
      posterPath: libraryItems.posterPath,
    })
    .from(libraryItems)
    .where(
      and(
        inArray(libraryItems.kind, ["movie", "show"]),
        isNotNull(libraryItems.tmdbId),
        ilike(libraryItems.title, `%${trimmed}%`),
      ),
    )
    .orderBy(desc(libraryItems.addedAt))
    .limit(limit);

  return rows.map((row) => ({
    ratingKey: row.ratingKey,
    kind: row.kind === "movie" ? ("movie" as const) : ("tv" as const),
    providerId: row.tmdbId ?? "",
    title: row.title,
    year: row.year,
    posterUrl: posterUrl(row.posterPath),
  }));
}

/**
 * The seasons of a show as the server actually holds them.
 *
 * A report about something being wrong points at what exists, so the choice
 * comes from the index. A report about something missing is the other way
 * round and reads the broadcast calendar instead.
 */
export async function seasonsOnServer(providerId: string): Promise<number[]> {
  const rows = await db().execute<{ season_number: number }>(sql`
    SELECT DISTINCT ep.season_number
      FROM library_item AS ep
      JOIN library_item AS show
        ON show.rating_key = ep.grandparent_rating_key
     WHERE ep.kind = 'episode'
       AND show.tmdb_id = ${providerId}::text
       AND ep.season_number IS NOT NULL
     ORDER BY ep.season_number
  `);
  return rows.map((row) => row.season_number);
}

/**
 * How many episodes of each season the server holds.
 *
 * One statement rather than one query per season: a title page draws the whole
 * ladder at once, and a show with twenty seasons would otherwise cost twenty
 * round trips to say the same thing.
 */
export async function episodeCountsBySeason(
  providerId: string,
): Promise<Map<number, number>> {
  const rows = await db().execute<{ season_number: number; held: number }>(sql`
    SELECT ep.season_number, COUNT(DISTINCT ep.episode_number)::int AS held
      FROM library_item AS ep
      JOIN library_item AS show
        ON show.rating_key = ep.grandparent_rating_key
     WHERE ep.kind = 'episode'
       AND show.tmdb_id = ${providerId}::text
       AND ep.season_number IS NOT NULL
       AND ep.episode_number IS NOT NULL
     GROUP BY ep.season_number
  `);
  return new Map(rows.map((row) => [row.season_number, Number(row.held)]));
}

/** The episodes of one season, as the server holds them. */
export async function episodesOnServer(
  providerId: string,
  seasonNumber: number,
): Promise<{ episodeNumber: number; title: string }[]> {
  const rows = await db().execute<{
    episode_number: number;
    title: string;
  }>(sql`
    SELECT ep.episode_number, ep.title
      FROM library_item AS ep
      JOIN library_item AS show
        ON show.rating_key = ep.grandparent_rating_key
     WHERE ep.kind = 'episode'
       AND show.tmdb_id = ${providerId}::text
       AND ep.season_number = ${seasonNumber}::int
       AND ep.episode_number IS NOT NULL
     ORDER BY ep.episode_number
  `);
  return rows.map((row) => ({
    episodeNumber: row.episode_number,
    title: row.title,
  }));
}

/**
 * A genuine Postgres array, written out rather than passed as one.
 *
 * A JavaScript array dropped into a template is expanded into a parenthesised
 * list of parameters, which Postgres reads as a record: `&& ($1, $2)::int[]`
 * fails at the cast, and the whole request comes back a 500. Spelling out
 * `ARRAY[...]` keeps the values parameterised and the type right.
 */
export function intArray(values: number[]) {
  return sql`ARRAY[${sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  )}]::int[]`;
}

/**
 * Random picks on the server that match at least one of these genres.
 *
 * The overlap operator reads the array the enrichment pass filled in, so the
 * guided picker can answer half its selection from what is already here. That
 * half is the point: an idea you can act on tonight beats one you have to wait
 * for.
 */
export async function randomAvailableByGenres(
  kind: "movie" | "tv",
  genreIds: number[],
  limit: number,
  excludeGenreIds: number[] = [],
  requireGenreIds: number[] = [],
): Promise<RecentItem[]> {
  if (genreIds.length === 0) return [];
  const rows = await db()
    .select()
    .from(libraryItems)
    .where(
      and(
        eq(libraryItems.kind, kind === "movie" ? "movie" : "show"),
        isNotNull(libraryItems.posterPath),
        sql`${libraryItems.genreIds} && ${intArray(genreIds)}`,
        // The same union problem as on the provider side: a title kept only
        // because it carries Comedy somewhere is not an answer to "make me
        // laugh" when its other genre is Horror.
        ...(excludeGenreIds.length
          ? [
              sql`NOT (${libraryItems.genreIds} && ${intArray(excludeGenreIds)})`,
            ]
          : []),
        // Contains, not overlaps: these are the genres a title has to carry on
        // top of the mood, which is how "a romance, and drawn" stays two
        // conditions rather than widening into either of them. The index holds
        // no original language, so on this side "only anime" reads as
        // Animation alone: the shelf is what the server has, and it is small
        // enough that the difference is not what empties it.
        ...(requireGenreIds.length
          ? [sql`${libraryItems.genreIds} @> ${intArray(requireGenreIds)}`]
          : []),
      ),
    )
    .orderBy(sql`random()`)
    .limit(limit);
  return rows.map(toRecentItem);
}

function toRecentItem(row: typeof libraryItems.$inferSelect): RecentItem {
  return {
    ratingKey: row.ratingKey,
    providerId: row.tmdbId,
    kind: row.kind === "season" ? "show" : row.kind,
    title: row.title,
    showTitle: row.grandparentTitle,
    year: row.year,
    seasonNumber: row.seasonNumber,
    episodeNumber: row.episodeNumber,
    // Posters come from TMDB, not from the media server: no token leaves the
    // backend and the browser only ever talks to a public CDN.
    posterUrl: posterUrl(row.posterPath),
    addedAt: row.addedAt,
  };
}
