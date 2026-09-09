import "server-only";

import {
  and,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lt,
  sql,
} from "drizzle-orm";

import { db } from "@/lib/db";
import { libraryItems } from "@/lib/db/schema";
import { bumpMetric } from "@/lib/domain/analytics";
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

export type RecentItem = {
  ratingKey: string;
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
  }

  // What the server no longer holds must not keep answering "available".
  if (items + episodeCount > 0) {
    await db().delete(libraryItems).where(lt(libraryItems.syncedAt, startedAt));
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

/**
 * "I do not know what to watch": one random title among what is on the server.
 * V1 is a plain random pick, filters can come later.
 */
export async function randomAvailableItem(): Promise<RecentItem | null> {
  const [row] = await db()
    .select()
    .from(libraryItems)
    .where(inArray(libraryItems.kind, ["movie", "show"]))
    .orderBy(sql`random()`)
    .limit(1);

  if (!row) return null;
  await bumpMetric("discovery_rolls");
  return toRecentItem(row);
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
 * Fills in missing posters from the metadata provider.
 *
 * Capped per run: the point is a steady trickle after each sync, not a burst of
 * calls against the provider quota. Only titles with a known provider id can be
 * resolved, and a failure simply leaves the poster for the next run.
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
        isNull(libraryItems.posterPath),
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
      if (!summary.posterPath) continue;
      await db()
        .update(libraryItems)
        .set({ posterPath: summary.posterPath })
        .where(eq(libraryItems.id, row.id));
      filled += 1;
    } catch (error) {
      console.warn(
        `[library] poster lookup failed tmdbId=${row.tmdbId}`,
        error,
      );
    }
  }
  return filled;
}

function toRecentItem(row: typeof libraryItems.$inferSelect): RecentItem {
  return {
    ratingKey: row.ratingKey,
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
