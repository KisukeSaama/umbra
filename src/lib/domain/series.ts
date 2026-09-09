import "server-only";

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  episodeTasks,
  episodes,
  media,
  trackedSeries,
  type EpisodeStatus,
} from "@/lib/db/schema";
import { ensureMedia } from "@/lib/domain/catalog";
import { NotFoundError } from "@/lib/errors";
import { isRunning } from "@/lib/providers/metadata";
import { tmdbProvider } from "@/lib/providers/tmdb";

/**
 * Series Tracker.
 *
 * Three deliberately separate operations:
 *  - `trackSeries`: put a show under watch;
 *  - `syncSeriesEpisodes`: pull the broadcast calendar from the provider;
 *  - `reconcileEpisodes`: compare that calendar with what is actually on the
 *    server, and derive the work to be done.
 *
 * Reconciliation depends on no schedule: it compares dates against "now".
 * Umbra can therefore stay down for days and catch up entirely on the next run
 * (see `docs/architecture.md`).
 */

export async function trackSeries(providerId: string) {
  const details = await tmdbProvider.seriesDetails(providerId);
  const mediaId = await ensureMedia(details.summary);

  const [series] = await db()
    .insert(trackedSeries)
    .values({ mediaId, providerStatus: details.status })
    .onConflictDoUpdate({
      target: trackedSeries.mediaId,
      set: { enabled: true, providerStatus: details.status },
    })
    .returning({ id: trackedSeries.id });

  await syncSeriesEpisodes(series.id, providerId);
  return series.id;
}

export async function setSeriesEnabled(seriesId: string, enabled: boolean) {
  const [row] = await db()
    .update(trackedSeries)
    .set({ enabled })
    .where(eq(trackedSeries.id, seriesId))
    .returning({ id: trackedSeries.id });
  if (!row) throw new NotFoundError("error.seriesNotFound");
  return row;
}

/**
 * Pulls seasons and episodes from the provider.
 *
 * Idempotent: an episode is identified by (series, season, number), so running
 * the sync again updates instead of duplicating.
 */
export async function syncSeriesEpisodes(seriesId: string, providerId: string) {
  const details = await tmdbProvider.seriesDetails(providerId);

  // Specials (season 0) take no part in release tracking.
  const seasons = details.seasons.filter((season) => season.seasonNumber > 0);
  let count = 0;

  for (const season of seasons) {
    const seasonEpisodes = await tmdbProvider.seasonEpisodes(
      providerId,
      season.seasonNumber,
    );
    if (seasonEpisodes.length === 0) continue;

    await db()
      .insert(episodes)
      .values(
        seasonEpisodes.map((episode) => ({
          seriesId,
          seasonNumber: episode.seasonNumber,
          episodeNumber: episode.episodeNumber,
          providerEpisodeId: episode.providerEpisodeId,
          title: episode.title,
          airDate: episode.airDate,
        })),
      )
      .onConflictDoUpdate({
        target: [
          episodes.seriesId,
          episodes.seasonNumber,
          episodes.episodeNumber,
        ],
        set: {
          title: sql`excluded.title`,
          airDate: sql`excluded.air_date`,
          providerEpisodeId: sql`excluded.provider_episode_id`,
          updatedAt: new Date(),
        },
      });
    count += seasonEpisodes.length;
  }

  await db()
    .update(trackedSeries)
    .set({
      lastSyncedAt: new Date(),
      providerStatus: details.status,
      // A finished show stays tracked but stops asking for attention.
      enabled: isRunning(details),
    })
    .where(eq(trackedSeries.id, seriesId));

  return count;
}

/**
 * Compares known episodes with the server library.
 *
 * An episode becomes:
 *  - `available` when it is on the server (and its task closes itself);
 *  - `aired_missing` when its broadcast date has passed and it is absent;
 *  - `scheduled` otherwise.
 */
export async function reconcileEpisodes(): Promise<{
  available: number;
  missing: number;
  tasksOpened: number;
}> {
  // 1. What is on the server, matched by (show key, season, number).
  const availableResult = await db().execute(sql`
    UPDATE episode AS e
       SET plex_available = TRUE,
           plex_checked_at = now(),
           status = 'available',
           updated_at = now()
      FROM tracked_series AS s
      JOIN library_item AS l
        ON l.grandparent_rating_key = s.plex_rating_key
       AND l.kind = 'episode'
     WHERE e.series_id = s.id
       AND l.season_number = e.season_number
       AND l.episode_number = e.episode_number
       AND e.plex_available = FALSE
  `);

  // 2. What has aired but is absent. No dependency on when this runs: an
  //    episode released during downtime is caught on the next pass.
  const missingResult = await db().execute(sql`
    UPDATE episode AS e
       SET status = 'aired_missing',
           plex_checked_at = now(),
           updated_at = now()
     WHERE e.plex_available = FALSE
       AND e.air_date IS NOT NULL
       AND e.air_date <= CURRENT_DATE
       AND e.status <> 'aired_missing'
  `);

  // 3. One task per missing episode. `ON CONFLICT DO NOTHING` on the episode
  //    key means a rerun never creates a duplicate.
  const openedResult = await db().execute(sql`
    INSERT INTO episode_task (episode_id)
    SELECT e.id
      FROM episode AS e
      JOIN tracked_series AS s ON s.id = e.series_id
     WHERE e.status = 'aired_missing'
       AND s.enabled = TRUE
    ON CONFLICT (episode_id) DO NOTHING
  `);

  // 4. Tasks whose episode has arrived close themselves.
  await db().execute(sql`
    UPDATE episode_task AS t
       SET status = 'done',
           completed_at = now()
      FROM episode AS e
     WHERE t.episode_id = e.id
       AND t.status = 'open'
       AND e.plex_available = TRUE
  `);

  return {
    available: availableResult.count ?? 0,
    missing: missingResult.count ?? 0,
    tasksOpened: openedResult.count ?? 0,
  };
}

export type UpcomingEpisode = {
  seriesTitle: string;
  posterPath: string | null;
  seasonNumber: number;
  episodeNumber: number;
  episodeTitle: string | null;
  airDate: string | null;
  status: EpisodeStatus;
  /** The member is on this show: that is why the entry sits where it sits. */
  followed: boolean;
};

/**
 * Next broadcasts of tracked shows, for the home page and the calendar.
 *
 * The week is read through the member first: the shows they are actually on
 * come at the top, whatever else is due follows. Passing no key gives the plain
 * calendar, which is what the shared views and a member who turned
 * personalisation off get.
 *
 * The list is never cut down to the followed shows alone. A week the server is
 * preparing for everybody is still news, and a member who watched nothing this
 * month would otherwise be shown an empty card.
 */
export async function upcomingEpisodes(
  limit = 8,
  followedKeys: string[] = [],
): Promise<UpcomingEpisode[]> {
  const followed =
    followedKeys.length > 0
      ? sql<boolean>`COALESCE(${inArray(trackedSeries.plexRatingKey, followedKeys)}, FALSE)`
      : sql<boolean>`FALSE`;

  return db()
    .select({
      seriesTitle: media.title,
      posterPath: media.posterPath,
      seasonNumber: episodes.seasonNumber,
      episodeNumber: episodes.episodeNumber,
      episodeTitle: episodes.title,
      airDate: episodes.airDate,
      status: episodes.status,
      followed,
    })
    .from(episodes)
    .innerJoin(trackedSeries, eq(trackedSeries.id, episodes.seriesId))
    .innerJoin(media, eq(media.id, trackedSeries.mediaId))
    .where(
      and(
        eq(trackedSeries.enabled, true),
        eq(episodes.plexAvailable, false),
        sql`${episodes.airDate} IS NOT NULL`,
        sql`${episodes.airDate} >= CURRENT_DATE - INTERVAL '7 days'`,
      ),
    )
    .orderBy(desc(followed), asc(episodes.airDate))
    .limit(limit);
}

export async function listTrackedSeries() {
  return db()
    .select({
      id: trackedSeries.id,
      title: media.title,
      providerId: media.providerId,
      posterPath: media.posterPath,
      enabled: trackedSeries.enabled,
      providerStatus: trackedSeries.providerStatus,
      lastSyncedAt: trackedSeries.lastSyncedAt,
      plexRatingKey: trackedSeries.plexRatingKey,
      missing: sql<number>`(
        SELECT count(*)::int FROM episode e
         WHERE e.series_id = ${trackedSeries.id} AND e.status = 'aired_missing'
      )`,
    })
    .from(trackedSeries)
    .innerJoin(media, eq(media.id, trackedSeries.mediaId))
    .orderBy(asc(media.title));
}

export async function listOpenEpisodeTasks() {
  return db()
    .select({
      id: episodeTasks.id,
      createdAt: episodeTasks.createdAt,
      seriesTitle: media.title,
      posterPath: media.posterPath,
      seasonNumber: episodes.seasonNumber,
      episodeNumber: episodes.episodeNumber,
      episodeTitle: episodes.title,
      airDate: episodes.airDate,
    })
    .from(episodeTasks)
    .innerJoin(episodes, eq(episodes.id, episodeTasks.episodeId))
    .innerJoin(trackedSeries, eq(trackedSeries.id, episodes.seriesId))
    .innerJoin(media, eq(media.id, trackedSeries.mediaId))
    .where(eq(episodeTasks.status, "open"))
    .orderBy(asc(episodes.airDate));
}

export async function closeEpisodeTask(
  taskId: string,
  status: "done" | "dismissed",
) {
  const [row] = await db()
    .update(episodeTasks)
    .set({ status, completedAt: new Date() })
    .where(eq(episodeTasks.id, taskId))
    .returning({ id: episodeTasks.id });
  if (!row) throw new NotFoundError("error.taskNotFound");
  return row;
}

/**
 * Links every tracked show to its server entry when one exists. Without that
 * key, episode reconciliation has nothing to compare against.
 */
export async function linkSeriesToLibrary(): Promise<number> {
  const result = await db().execute(sql`
    UPDATE tracked_series AS s
       SET plex_rating_key = l.rating_key
      FROM media AS m, library_item AS l
     WHERE s.media_id = m.id
       AND l.kind = 'show'
       AND l.tmdb_id = m.provider_id
       AND (s.plex_rating_key IS DISTINCT FROM l.rating_key)
  `);
  return result.count ?? 0;
}

/** Shows due for a resync: active ones first, oldest sync first. */
export async function seriesDueForSync(limit = 20) {
  return db()
    .select({
      id: trackedSeries.id,
      providerId: media.providerId,
      lastSyncedAt: trackedSeries.lastSyncedAt,
    })
    .from(trackedSeries)
    .innerJoin(media, eq(media.id, trackedSeries.mediaId))
    .where(
      and(
        eq(trackedSeries.enabled, true),
        sql`(${trackedSeries.lastSyncedAt} IS NULL OR ${trackedSeries.lastSyncedAt} < now() - INTERVAL '12 hours')`,
      ),
    )
    .orderBy(sql`${trackedSeries.lastSyncedAt} NULLS FIRST`)
    .limit(limit);
}
