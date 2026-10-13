import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  episodes,
  media,
  trackedSeries,
  type ReportReason,
} from "@/lib/db/schema";
import { type EpisodeState, seasonEpisodes } from "@/lib/domain/catalog";
import {
  type CalendarEpisode,
  mergeEpisodes,
  seasonShortfall,
} from "@/lib/domain/seasons";
import { formatEpisodeRuns } from "@/lib/format";

export type SeasonGap = {
  missing: number;
  held: number;
  aired: number;
  codes: string;
};

type GapReport = {
  id: string;
  reason: ReportReason;
  seasonNumber: number | null;
  episodeNumber: number | null;
  media: { providerId: string };
};

/**
 * What each ask for the rest of a season means in files, for whoever answers
 * it, keyed by report id.
 *
 * "Episodes are missing" is what the member could say; the administration needs
 * how many to fetch and which, spelled the way an indexer is searched. Only a
 * season asked for as a whole has a gap to measure: any other report has no
 * entry.
 *
 * Read for a whole page at once. A series under watch already has its calendar
 * in the `episode` table, so its seasons cost one query for the page, plus one
 * for what the server holds. Only a season the tracker has no calendar for is
 * asked of the provider, through Janus.
 *
 * `missing` is zero when the provider could not be reached, or when the gap has
 * been filled since the ask: `held` is then still true on its own.
 */
export async function seasonGaps(
  reports: readonly GapReport[],
): Promise<Map<string, SeasonGap>> {
  const asks = reports.filter(
    (report): report is GapReport & { seasonNumber: number } =>
      report.reason === "missing_episode" &&
      report.seasonNumber !== null &&
      report.episodeNumber === null,
  );
  const gaps = new Map<string, SeasonGap>();
  if (asks.length === 0) return gaps;

  const providerIds = [...new Set(asks.map((ask) => ask.media.providerId))];
  const seasonNumbers = [...new Set(asks.map((ask) => ask.seasonNumber))];
  const [calendar, held] = await Promise.all([
    trackedCalendar(providerIds, seasonNumbers),
    heldEpisodes(providerIds, seasonNumbers),
  ]);

  // Two asks for the same season share one read of it.
  const seasons = new Map<string, Promise<EpisodeState[]>>();
  const seasonOf = (providerId: string, seasonNumber: number) => {
    const key = pairKey(providerId, seasonNumber);
    let season = seasons.get(key);
    if (!season) {
      const listed = calendar.get(key);
      season = listed
        ? Promise.resolve(mergeEpisodes(listed, held.get(key) ?? []))
        : seasonEpisodes(providerId, seasonNumber);
      seasons.set(key, season);
    }
    return season;
  };

  await Promise.all(
    asks.map(async (ask) => {
      const { aired, missing, runs } = seasonShortfall(
        await seasonOf(ask.media.providerId, ask.seasonNumber),
      );
      gaps.set(ask.id, {
        missing,
        held: aired - missing,
        aired,
        codes: formatEpisodeRuns(ask.seasonNumber, runs),
      });
    }),
  );
  return gaps;
}

function pairKey(providerId: string, seasonNumber: number): string {
  return `${providerId}:${seasonNumber}`;
}

/**
 * The tracker's copy of the provider calendar, for the series under watch whose
 * calendar has been pulled. A season it holds no episode of is left out, so the
 * provider is asked about it instead.
 */
async function trackedCalendar(
  providerIds: string[],
  seasonNumbers: number[],
): Promise<Map<string, CalendarEpisode[]>> {
  const rows = await db()
    .select({
      providerId: media.providerId,
      seasonNumber: episodes.seasonNumber,
      episodeNumber: episodes.episodeNumber,
      title: episodes.title,
      airDate: episodes.airDate,
    })
    .from(episodes)
    .innerJoin(trackedSeries, eq(trackedSeries.id, episodes.seriesId))
    .innerJoin(media, eq(media.id, trackedSeries.mediaId))
    .where(
      and(
        eq(media.mediaType, "tv"),
        inArray(media.providerId, providerIds),
        inArray(episodes.seasonNumber, seasonNumbers),
        isNotNull(trackedSeries.lastSyncedAt),
      ),
    );

  const calendar = new Map<string, CalendarEpisode[]>();
  for (const row of rows) {
    const key = pairKey(row.providerId, row.seasonNumber);
    const season = calendar.get(key) ?? [];
    season.push(row);
    calendar.set(key, season);
  }
  return calendar;
}

/**
 * What the server holds of those seasons, read the way `episodesOnServer`
 * reads one: under the series' own entry, never a re-cut's.
 */
async function heldEpisodes(
  providerIds: string[],
  seasonNumbers: number[],
): Promise<Map<string, { episodeNumber: number; title: string }[]>> {
  const rows = await db().execute<{
    provider_id: string;
    season_number: number;
    episode_number: number;
    title: string;
  }>(sql`
    SELECT show.tmdb_id AS provider_id, ep.season_number, ep.episode_number,
           ep.title
      FROM library_item AS ep
      JOIN library_item AS show
        ON show.rating_key = ep.grandparent_rating_key
     WHERE ep.kind = 'episode'
       AND show.tmdb_id IN (${sql.join(
         providerIds.map((id) => sql`${id}::text`),
         sql`, `,
       )})
       AND show.cut_provider_id IS NULL
       AND ep.season_number IN (${sql.join(
         seasonNumbers.map((season) => sql`${season}::int`),
         sql`, `,
       )})
       AND ep.episode_number IS NOT NULL
  `);

  const held = new Map<string, { episodeNumber: number; title: string }[]>();
  for (const row of rows) {
    const key = pairKey(row.provider_id, row.season_number);
    const season = held.get(key) ?? [];
    season.push({ episodeNumber: row.episode_number, title: row.title });
    held.set(key, season);
  }
  return held;
}
