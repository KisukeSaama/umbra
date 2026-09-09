import "server-only";

import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  episodeTasks,
  episodes,
  media,
  trackedSeries,
  type EpisodeStatus,
} from "@/lib/db/schema";
import { ensureMedia } from "@/lib/domain/catalog";
import { formatEpisodeCode } from "@/lib/format";
import { notify } from "@/lib/domain/notifications";
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

/** Past this count, one summary is sent instead of one message per episode. */
const MAX_EPISODE_NOTIFICATIONS = 5;

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

/**
 * Tells the administrator about aired but missing episodes, once per episode
 * (`notified_at`). A large catch-up is summarised in one message rather than
 * fifty notifications.
 */
export async function notifyOpenEpisodeTasks() {
  const pending = await db()
    .select({
      taskId: episodeTasks.id,
      seasonNumber: episodes.seasonNumber,
      episodeNumber: episodes.episodeNumber,
      airDate: episodes.airDate,
      title: media.title,
    })
    .from(episodeTasks)
    .innerJoin(episodes, eq(episodes.id, episodeTasks.episodeId))
    .innerJoin(trackedSeries, eq(trackedSeries.id, episodes.seriesId))
    .innerJoin(media, eq(media.id, trackedSeries.mediaId))
    .where(
      and(eq(episodeTasks.status, "open"), isNull(episodeTasks.notifiedAt)),
    )
    .orderBy(asc(episodes.airDate));

  if (pending.length === 0) return 0;

  if (pending.length <= MAX_EPISODE_NOTIFICATIONS) {
    for (const task of pending) {
      await notify({
        kind: "episode",
        title: `${task.title} ${formatEpisodeCode(task.seasonNumber, task.episodeNumber)} has aired and seems missing from the server.`,
      });
    }
  } else {
    const head = pending
      .slice(0, MAX_EPISODE_NOTIFICATIONS)
      .map(
        (task) =>
          `- ${task.title} ${formatEpisodeCode(task.seasonNumber, task.episodeNumber)}`,
      )
      .join("\n");
    await notify({
      kind: "episode",
      title: `${pending.length} aired episodes seem missing from the server.`,
      body: `${head}\n... and ${pending.length - MAX_EPISODE_NOTIFICATIONS} more.`,
    });
  }

  await db()
    .update(episodeTasks)
    .set({ notifiedAt: new Date() })
    .where(
      inArray(
        episodeTasks.id,
        pending.map((task) => task.taskId),
      ),
    );

  return pending.length;
}

export type UpcomingEpisode = {
  seriesTitle: string;
  posterPath: string | null;
  seasonNumber: number;
  episodeNumber: number;
  episodeTitle: string | null;
  airDate: string | null;
  status: EpisodeStatus;
};

/** Next broadcasts of tracked shows, for the home page and the calendar. */
export async function upcomingEpisodes(limit = 8): Promise<UpcomingEpisode[]> {
  return db()
    .select({
      seriesTitle: media.title,
      posterPath: media.posterPath,
      seasonNumber: episodes.seasonNumber,
      episodeNumber: episodes.episodeNumber,
      episodeTitle: episodes.title,
      airDate: episodes.airDate,
      status: episodes.status,
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
    .orderBy(asc(episodes.airDate))
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
