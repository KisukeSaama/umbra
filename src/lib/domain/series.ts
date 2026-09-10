import "server-only";

import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  notInArray,
  or,
  sql,
} from "drizzle-orm";

import { db } from "@/lib/db";
import {
  episodeTasks,
  episodes,
  libraryItems,
  media,
  mediaRequests,
  trackedSeries,
  type EpisodeStatus,
} from "@/lib/db/schema";
import { ensureMedia } from "@/lib/domain/catalog";
import { followedSeriesKeys } from "@/lib/domain/taste";
import { ConflictError, NotFoundError } from "@/lib/errors";
import { isRunning } from "@/lib/providers/metadata";
import { tmdbProvider } from "@/lib/providers/tmdb";
import { episodesInWeek, today, weekStatus } from "@/lib/week";

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

/** A request that puts a series back under watch on every cycle. */
const activeRequest = sql`EXISTS (
  SELECT 1 FROM media_request r
   WHERE r.media_id = ${trackedSeries.mediaId}
     AND r.status = 'accepted'
)`;

/**
 * Takes a series off the watch for good, with its calendar and its tasks.
 *
 * Refused while a request for it is accepted: the next cycle
 * would track it again (`trackAcceptedSeries`), so the delete would only look
 * like it worked. Pausing is the answer there. The condition sits in the
 * DELETE itself, so a request accepted in between cannot slip past it.
 */
export async function untrackSeries(seriesId: string) {
  const [row] = await db()
    .delete(trackedSeries)
    .where(and(eq(trackedSeries.id, seriesId), sql`NOT ${activeRequest}`))
    .returning({ id: trackedSeries.id });
  if (row) return row;

  const [exists] = await db()
    .select({ id: trackedSeries.id })
    .from(trackedSeries)
    .where(eq(trackedSeries.id, seriesId));
  if (exists) throw new ConflictError("error.seriesRequested");
  throw new NotFoundError("error.seriesNotFound");
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
    const numbers = seasonEpisodes.map((episode) => episode.episodeNumber);

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
    /*
     * A provider that renumbers a season, or drops an episode it had
     * announced, leaves a row behind. Nothing ever aired under that number, so
     * it would sit as `aired_missing` with a task open against it for good.
     *
     * Scoped to the seasons that just answered, and never to the ones that did
     * not: a season whose call failed or came back empty keeps everything it
     * had rather than being taken as an answer of "no episodes".
     */
    await db()
      .delete(episodes)
      .where(
        and(
          eq(episodes.seriesId, seriesId),
          eq(episodes.seasonNumber, season.seasonNumber),
          notInArray(episodes.episodeNumber, numbers),
        ),
      );

    count += seasonEpisodes.length;
  }

  /*
   * A finished show stays tracked but stops asking for attention, and a show
   * that comes back starts again. Written only when the provider's own answer
   * changes, though: writing it on every sync overruled the administrator, who
   * could turn an ended series back on and find it off twelve hours later.
   */
  await db()
    .update(trackedSeries)
    .set({
      lastSyncedAt: new Date(),
      providerStatus: details.status,
      enabled: sql`CASE
        WHEN ${trackedSeries.providerStatus} IS DISTINCT FROM ${details.status}
        THEN ${isRunning(details)}
        ELSE ${trackedSeries.enabled}
      END`,
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

  /*
   * 2. What the server no longer holds.
   *
   * Presence used to be a one-way door: an episode marked available stayed
   * available even after its file was deleted, so the gap never reappeared in
   * the calendar, no task was raised, and a report saying the series was
   * behind could resolve itself against a calendar that claimed everything was
   * there.
   *
   * Only for a series whose entry on the server is known, and read as an
   * absence from the index rather than as an answer from the server: a sync
   * that failed leaves the index as it was, so nothing here flips.
   */
  await db().execute(sql`
    UPDATE episode AS e
       SET plex_available = FALSE,
           plex_checked_at = now(),
           status = CASE
             WHEN e.air_date IS NOT NULL AND e.air_date <= CURRENT_DATE
             THEN 'aired_missing'
             ELSE 'scheduled'
           END,
           updated_at = now()
      FROM tracked_series AS s
     WHERE e.series_id = s.id
       AND e.plex_available = TRUE
       AND s.plex_rating_key IS NOT NULL
       AND NOT EXISTS (
             SELECT 1
               FROM library_item AS l
              WHERE l.grandparent_rating_key = s.plex_rating_key
                AND l.kind = 'episode'
                AND l.season_number = e.season_number
                AND l.episode_number = e.episode_number
           )
  `);

  // 3. What has aired but is absent. No dependency on when this runs: an
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

  // 4. One task per missing episode. `ON CONFLICT DO NOTHING` on the episode
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

  // 5. Tasks whose episode has arrived close themselves.
  await db().execute(sql`
    UPDATE episode_task AS t
       SET status = 'done',
           completed_at = now()
      FROM episode AS e
     WHERE t.episode_id = e.id
       AND t.status = 'open'
       AND e.plex_available = TRUE
  `);

  /*
   * 6. A task whose episode has gone away again opens back up.
   *
   * There is one task per episode for the life of that episode, so a closed
   * one is the only thing that can carry the shortfall a second time. A task
   * the administration dismissed is left alone: that was an answer, and this
   * is not the place to argue with it.
   */
  await db().execute(sql`
    UPDATE episode_task AS t
       SET status = 'open',
           completed_at = NULL
      FROM episode AS e
      JOIN tracked_series AS s ON s.id = e.series_id
     WHERE t.episode_id = e.id
       AND t.status = 'done'
       AND e.status = 'aired_missing'
       AND s.enabled = TRUE
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
};

/** How many of a member's recent shows the week asks the provider about. */
const WATCHED_SHOWS = 8;

/**
 * The week of the shows a member is on, whether or not anybody asked for them.
 *
 * The tracker only knows the series that came in through a request, so reading
 * the week from it answered "what happened to what was asked for", which is not
 * the question. This starts from the member's recent history instead, read live
 * and dropped with the render, and asks the provider for the last and the next
 * broadcast of each show. The server index then says which of them are here.
 *
 * One provider call per show, answered by the gateway's cache after the first.
 * A show the provider does not answer for is left out, never the card.
 */
export async function watchingThisWeek(
  accountId: string,
  language?: string,
  limit = 5,
): Promise<UpcomingEpisode[]> {
  const keys = (await followedSeriesKeys(accountId)).slice(0, WATCHED_SHOWS);
  if (keys.length === 0) return [];

  const shows = await db()
    .select({
      ratingKey: libraryItems.ratingKey,
      tmdbId: libraryItems.tmdbId,
      posterPath: libraryItems.posterPath,
    })
    .from(libraryItems)
    .where(
      and(
        inArray(libraryItems.ratingKey, keys),
        eq(libraryItems.kind, "show"),
        isNotNull(libraryItems.tmdbId),
      ),
    );

  const day = today();
  const found = (
    await Promise.all(
      shows.map(async (show) => {
        try {
          const details = await tmdbProvider.seriesDetails(
            show.tmdbId as string,
            language,
          );
          return episodesInWeek(details, day).map((episode) => ({
            showKey: show.ratingKey,
            seriesTitle: details.summary.title,
            posterPath: details.summary.posterPath ?? show.posterPath,
            episode,
          }));
        } catch (error) {
          console.warn(
            `[series] week unavailable tmdbId=${show.tmdbId}`,
            error,
          );
          return [];
        }
      }),
    )
  ).flat();
  if (found.length === 0) return [];

  const present = await db()
    .select({
      showKey: libraryItems.grandparentRatingKey,
      seasonNumber: libraryItems.seasonNumber,
      episodeNumber: libraryItems.episodeNumber,
    })
    .from(libraryItems)
    .where(
      and(
        eq(libraryItems.kind, "episode"),
        or(
          ...found.map(({ showKey, episode }) =>
            and(
              eq(libraryItems.grandparentRatingKey, showKey),
              eq(libraryItems.seasonNumber, episode.seasonNumber),
              eq(libraryItems.episodeNumber, episode.episodeNumber),
            ),
          ),
        ),
      ),
    );
  const here = new Set(
    present.map(
      (row) => `${row.showKey}:${row.seasonNumber}:${row.episodeNumber}`,
    ),
  );

  return found
    .map(({ showKey, seriesTitle, posterPath, episode }) => ({
      seriesTitle,
      posterPath,
      seasonNumber: episode.seasonNumber,
      episodeNumber: episode.episodeNumber,
      episodeTitle: episode.title,
      airDate: episode.airDate,
      status: weekStatus(
        episode.airDate ?? day,
        here.has(`${showKey}:${episode.seasonNumber}:${episode.episodeNumber}`),
        day,
      ),
    }))
    .sort((a, b) => (a.airDate ?? "").localeCompare(b.airDate ?? ""))
    .slice(0, limit);
}

/**
 * Next broadcasts of tracked shows: the server's own calendar.
 *
 * What the home page falls back on when nothing a member watches airs this
 * week, so the card still carries the week the server is preparing for.
 */
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

export async function listTrackedSeries(
  /** The slice to read, when the caller pages. Everything, when it does not. */
  window?: { limit: number; offset: number },
) {
  const query = db()
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
      /*
       * Whether a member asked for it. Read from the requests rather than
       * stored on the row: a series added by hand that someone later asks for
       * is from a request from then on, with nothing to keep in step.
       */
      fromRequest: sql<boolean>`EXISTS (
        SELECT 1 FROM media_request r WHERE r.media_id = ${trackedSeries.mediaId}
      )`,
      /** Whether `untrackSeries` would take it, so the button is not drawn otherwise. */
      removable: sql<boolean>`NOT ${activeRequest}`,
    })
    .from(trackedSeries)
    .innerJoin(media, eq(media.id, trackedSeries.mediaId))
    .orderBy(asc(media.title));

  return window ? query.limit(window.limit).offset(window.offset) : query;
}

/** How many series are under watch, for the pager above the list. */
export async function countTrackedSeries(): Promise<number> {
  const [row] = await db()
    .select({ count: sql<number>`count(*)::int` })
    .from(trackedSeries);
  return row?.count ?? 0;
}

export async function listOpenEpisodeTasks() {
  return (
    db()
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
      .orderBy(asc(episodes.airDate))
      // Bounded: a tracker catching up on a long-running show can raise hundreds
      // of these, and the page is a working queue rather than an archive.
      .limit(200)
  );
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

/**
 * Shows due for a resync: active ones first, oldest sync first.
 *
 * A show that is off is looked at too, once a week rather than twice a day.
 * Without that it could never come back: the provider is the only thing that
 * knows a finished series has been renewed, and a series nobody resyncs is
 * never asked about again.
 */
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
      sql`(
        ${trackedSeries.lastSyncedAt} IS NULL
        OR ${trackedSeries.lastSyncedAt} < now() - CASE
             WHEN ${trackedSeries.enabled} THEN INTERVAL '12 hours'
             ELSE INTERVAL '7 days'
           END
      )`,
    )
    .orderBy(
      desc(trackedSeries.enabled),
      sql`${trackedSeries.lastSyncedAt} NULLS FIRST`,
    )
    .limit(limit);
}

/**
 * Series an accepted request should have put under watch, and did not.
 *
 * Accepting is what starts the tracker, and that call reaches the metadata
 * provider: when it does not answer, the decision still stands and the series
 * is left untracked. Rather than fail the decision, this picks up the leftovers
 * on the next cycle. Idempotent, since tracking a series that is already
 * tracked is an upsert.
 */
export async function trackAcceptedSeries(limit = 10): Promise<number> {
  const rows = await db()
    .select({ providerId: media.providerId })
    .from(mediaRequests)
    .innerJoin(media, eq(media.id, mediaRequests.mediaId))
    .where(
      and(
        eq(media.mediaType, "tv"),
        eq(mediaRequests.status, "accepted"),
        sql`NOT EXISTS (
          SELECT 1 FROM tracked_series AS s WHERE s.media_id = ${media.id}
        )`,
      ),
    )
    .limit(limit);

  let tracked = 0;
  for (const row of rows) {
    try {
      await trackSeries(row.providerId);
      tracked += 1;
    } catch (error) {
      console.warn(
        `[series] deferred tracking failed providerId=${row.providerId}`,
        error,
      );
    }
  }
  return tracked;
}
