import "server-only";

import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  accounts,
  libraryItems,
  media,
  reportFollowers,
  reports,
  type ReportReason,
  type ReportStatus,
} from "@/lib/db/schema";
import { bumpMetric } from "@/lib/domain/analytics";
import { availabilityFor, ensureMedia, yearOf } from "@/lib/domain/catalog";
import { notify } from "@/lib/domain/notifications";
import { trackSeries } from "@/lib/domain/series";
import { BadRequestError, ConflictError, NotFoundError } from "@/lib/errors";
import type { MediaKind } from "@/lib/providers/metadata";
import { posterUrl, tmdbProvider } from "@/lib/providers/tmdb";
import {
  canTransition,
  isReasonAllowed,
  LIVE_REPORT_STATUSES,
  targetOf,
} from "@/lib/reports/reasons";

/**
 * Signalling a problem.
 *
 * The other half of a request: a request says a title is missing, a report says
 * a title is there but wrong. Both are the same shape on purpose, so the
 * administration works one queue and the member follows one list.
 */

export type ReportRow = {
  id: string;
  reason: ReportReason;
  status: ReportStatus;
  seasonNumber: number | null;
  episodeNumber: number | null;
  createdAt: Date;
  acknowledgedAt: Date | null;
  closedAt: Date | null;
  reportedBy: string | null;
  libraryRatingKey: string | null;
  media: {
    providerId: string;
    kind: MediaKind;
    title: string;
    year: number | null;
    posterUrl: string | null;
  };
};

/**
 * Records a report, or joins the one that already exists.
 *
 * Written as one statement because uniqueness lives in a partial index over an
 * expression, which the query builder cannot name as a conflict target. The
 * only select inside it decides who to tell later, never whether the row may be
 * created: two members clicking at the same instant get one report and two
 * followers, not two reports.
 */
export async function createReport(input: {
  kind: MediaKind;
  providerId: string;
  seasonNumber: number | null;
  episodeNumber: number | null;
  reason: ReportReason;
  accountId: string;
  language?: string;
}): Promise<{ reportId: string; title: string; joined: boolean }> {
  const target = targetOf(input.kind, input.seasonNumber, input.episodeNumber);
  if (!isReasonAllowed(target, input.reason))
    throw new BadRequestError("error.reasonNotAllowed");

  // A report is about something that is supposed to be on the server. A title
  // that is not there is a request, and saying so is more useful than refusing.
  const availability = await availabilityFor(input.kind, input.providerId);
  if (availability !== "available")
    throw new ConflictError("error.notOnServer");

  const summary = await tmdbProvider.details(
    input.kind,
    input.providerId,
    input.language,
  );
  const mediaId = await ensureMedia(summary);
  const ratingKey = await serverKeyFor(input.kind, input.providerId);

  const rows = await db().execute<{ report_id: string; created: boolean }>(sql`
    WITH inserted AS (
      INSERT INTO report (media_id, season_number, episode_number, reason, reported_by, library_rating_key)
      VALUES (
        ${mediaId}::uuid,
        ${input.seasonNumber}::int,
        ${input.episodeNumber}::int,
        ${input.reason}::text,
        ${input.accountId}::uuid,
        ${ratingKey}::text
      )
      ON CONFLICT (media_id, (coalesce(season_number, -1)), (coalesce(episode_number, -1)), reason)
        WHERE status NOT IN ('resolved', 'rejected', 'duplicate')
      DO NOTHING
      RETURNING id
    ),
    chosen AS (
      SELECT id, TRUE AS created FROM inserted
      UNION ALL
      SELECT r.id, FALSE FROM report AS r
       WHERE NOT EXISTS (SELECT 1 FROM inserted)
         AND r.media_id = ${mediaId}::uuid
         AND coalesce(r.season_number, -1) = coalesce(${input.seasonNumber}::int, -1)
         AND coalesce(r.episode_number, -1) = coalesce(${input.episodeNumber}::int, -1)
         AND r.reason = ${input.reason}::text
         AND r.status NOT IN ('resolved', 'rejected', 'duplicate')
    ),
    followed AS (
      INSERT INTO report_follower (report_id, account_id)
      SELECT id, ${input.accountId}::uuid FROM chosen
      ON CONFLICT DO NOTHING
      RETURNING report_id
    )
    SELECT id AS report_id, created FROM chosen
  `);

  const row = rows[0];
  if (!row) throw new ConflictError("error.alreadyReported");

  await bumpMetric("reports_created");
  return {
    reportId: row.report_id,
    title: summary.title,
    joined: !row.created,
  };
}

/** The server key of a title, kept on the report so the admin can find it. */
async function serverKeyFor(kind: MediaKind, providerId: string) {
  const [row] = await db()
    .select({ ratingKey: libraryItems.ratingKey })
    .from(libraryItems)
    .where(
      and(
        eq(libraryItems.tmdbId, providerId),
        eq(libraryItems.kind, kind === "movie" ? "movie" : "show"),
      ),
    )
    .limit(1);
  return row?.ratingKey ?? null;
}

const REPORT_COLUMNS = {
  id: reports.id,
  reason: reports.reason,
  status: reports.status,
  seasonNumber: reports.seasonNumber,
  episodeNumber: reports.episodeNumber,
  createdAt: reports.createdAt,
  acknowledgedAt: reports.acknowledgedAt,
  closedAt: reports.closedAt,
  libraryRatingKey: reports.libraryRatingKey,
  reportedBy: accounts.username,
  providerId: media.providerId,
  mediaType: media.mediaType,
  title: media.title,
  releaseDate: media.releaseDate,
  posterPath: media.posterPath,
};

function toRow(row: {
  id: string;
  reason: ReportReason;
  status: ReportStatus;
  seasonNumber: number | null;
  episodeNumber: number | null;
  createdAt: Date;
  acknowledgedAt: Date | null;
  closedAt: Date | null;
  libraryRatingKey: string | null;
  reportedBy: string | null;
  providerId: string;
  mediaType: MediaKind;
  title: string;
  releaseDate: string | null;
  posterPath: string | null;
}): ReportRow {
  return {
    id: row.id,
    reason: row.reason,
    status: row.status,
    seasonNumber: row.seasonNumber,
    episodeNumber: row.episodeNumber,
    createdAt: row.createdAt,
    acknowledgedAt: row.acknowledgedAt,
    closedAt: row.closedAt,
    reportedBy: row.reportedBy,
    libraryRatingKey: row.libraryRatingKey,
    media: {
      providerId: row.providerId,
      kind: row.mediaType,
      title: row.title,
      year: yearOf(row.releaseDate),
      posterUrl: posterUrl(row.posterPath),
    },
  };
}

export async function listReports(
  statuses?: ReportStatus[],
): Promise<ReportRow[]> {
  const rows = await db()
    .select(REPORT_COLUMNS)
    .from(reports)
    .innerJoin(media, eq(media.id, reports.mediaId))
    .leftJoin(accounts, eq(accounts.id, reports.reportedBy))
    .where(statuses?.length ? inArray(reports.status, statuses) : undefined)
    .orderBy(desc(reports.createdAt));
  return rows.map(toRow);
}

/** The reports one member is waiting on, whether they opened them or joined. */
export async function listReportsFollowedBy(
  accountId: string,
): Promise<ReportRow[]> {
  const rows = await db()
    .select(REPORT_COLUMNS)
    .from(reportFollowers)
    .innerJoin(reports, eq(reports.id, reportFollowers.reportId))
    .innerJoin(media, eq(media.id, reports.mediaId))
    .leftJoin(accounts, eq(accounts.id, reports.reportedBy))
    .where(eq(reportFollowers.accountId, accountId))
    .orderBy(desc(reports.createdAt));
  return rows.map(toRow);
}

export async function countOpenReports(): Promise<number> {
  const [row] = await db()
    .select({ count: sql<number>`count(*)::int` })
    .from(reports)
    .where(inArray(reports.status, [...LIVE_REPORT_STATUSES]));
  return row?.count ?? 0;
}

/**
 * Moves a report.
 *
 * Taking up a series report starts tracking it, the way accepting a request
 * does: without a calendar the two reasons that could settle themselves never
 * would, and the report would sit open for nothing.
 */
export async function updateReportStatus(
  reportId: string,
  status: ReportStatus,
) {
  const [current] = await db()
    .select({ status: reports.status, mediaId: reports.mediaId })
    .from(reports)
    .where(eq(reports.id, reportId))
    .limit(1);
  if (!current) throw new NotFoundError("error.reportNotFound");
  if (!canTransition(current.status, status))
    throw new ConflictError("error.illegalTransition");

  const now = new Date();
  const closing =
    status === "resolved" || status === "rejected" || status === "duplicate";
  const [updated] = await db()
    .update(reports)
    .set({
      status,
      updatedAt: now,
      acknowledgedAt: status === "acknowledged" ? now : undefined,
      closedAt: closing ? now : undefined,
    })
    .where(eq(reports.id, reportId))
    .returning({ id: reports.id, status: reports.status });

  if (status === "acknowledged") {
    const [row] = await db()
      .select({ providerId: media.providerId, mediaType: media.mediaType })
      .from(media)
      .where(eq(media.id, current.mediaId))
      .limit(1);
    if (row?.mediaType === "tv") await trackSeries(row.providerId);
  }

  await notifyReportFollowers(reportId, status);
  return updated;
}

/** Everyone waiting on a report, its author included: they are a follower too. */
export async function notifyReportFollowers(
  reportId: string,
  status: ReportStatus,
) {
  const rows = await db()
    .select({
      accountId: reportFollowers.accountId,
      title: media.title,
      reason: reports.reason,
      seasonNumber: reports.seasonNumber,
      episodeNumber: reports.episodeNumber,
    })
    .from(reportFollowers)
    .innerJoin(reports, eq(reports.id, reportFollowers.reportId))
    .innerJoin(media, eq(media.id, reports.mediaId))
    .where(eq(reportFollowers.reportId, reportId));

  if (rows.length === 0) return 0;
  const first = rows[0];

  return notify(
    rows.map((row) => row.accountId),
    {
      kind: "report_status",
      subjectId: reportId,
      step: status,
      payload: {
        title: first.title,
        status,
        reason: first.reason,
        seasonNumber: first.seasonNumber ?? undefined,
        episodeNumber: first.episodeNumber ?? undefined,
      },
    },
  );
}

/**
 * Closes the reports the library has answered on its own.
 *
 * Only the reasons about something being absent: a codec, a track or a playback
 * failure is not visible from what Umbra indexes, and a job that pretended
 * otherwise would have to walk media parts on the server, which is exactly what
 * this project does not do.
 */
export async function closeReportsSolvedByLibrary(): Promise<number> {
  const result = await db().execute(sql`
    UPDATE report AS r
       SET status = 'resolved', closed_at = now(), updated_at = now()
      FROM media AS m
      JOIN library_item AS show
        ON show.kind = 'show' AND show.tmdb_id = m.provider_id
      JOIN library_item AS ep
        ON ep.kind = 'episode'
       AND ep.grandparent_rating_key = show.rating_key
       AND ep.season_number = r.season_number
       AND ep.episode_number = r.episode_number
     WHERE r.media_id = m.id
       AND r.reason = 'missing_episode'
       AND r.status IN ('open', 'acknowledged', 'in_progress')
  `);
  return result.count ?? 0;
}

/**
 * Closes season and series reports once the calendar says nothing that has
 * aired is missing any more.
 *
 * The two `EXISTS` guards are the whole point: without them a season the
 * provider does not know about, or a series whose calendar has never synced,
 * makes `NOT EXISTS` vacuously true and the report resolves itself having
 * changed nothing at all.
 */
export async function closeReportsSolvedByCalendar(): Promise<number> {
  const result = await db().execute(sql`
    UPDATE report AS r
       SET status = 'resolved', closed_at = now(), updated_at = now()
      FROM tracked_series AS s
     WHERE s.media_id = r.media_id
       AND s.last_synced_at IS NOT NULL
       AND r.status IN ('open', 'acknowledged', 'in_progress')
       AND (
         (r.reason = 'missing_season'
          AND r.season_number IS NOT NULL
          AND EXISTS (SELECT 1 FROM episode e
                       WHERE e.series_id = s.id
                         AND e.season_number = r.season_number)
          AND NOT EXISTS (SELECT 1 FROM episode e
                           WHERE e.series_id = s.id
                             AND e.season_number = r.season_number
                             AND e.plex_available = FALSE
                             AND e.air_date IS NOT NULL
                             AND e.air_date <= CURRENT_DATE))
         OR
         (r.reason = 'series_outdated'
          AND EXISTS (SELECT 1 FROM episode e WHERE e.series_id = s.id)
          AND NOT EXISTS (SELECT 1 FROM episode e
                           WHERE e.series_id = s.id
                             AND e.plex_available = FALSE
                             AND e.air_date IS NOT NULL
                             AND e.air_date <= CURRENT_DATE))
       )
  `);
  return result.count ?? 0;
}

/**
 * Tells the followers of every report a job closed recently.
 *
 * Separate from the update so a job never has to hold a list in memory, and
 * repeatable because the notification key already carries the resolved step.
 */
export async function notifyResolvedReports(): Promise<number> {
  const result = await db().execute(sql`
    INSERT INTO notification (account_id, kind, subject_id, dedup_key, payload)
    SELECT f.account_id,
           'report_status'::text,
           r.id,
           'report_status:' || r.id::text || ':resolved',
           jsonb_build_object('status', 'resolved', 'title', m.title, 'reason', r.reason)
      FROM report AS r
      JOIN media AS m ON m.id = r.media_id
      JOIN report_follower AS f ON f.report_id = r.id
     WHERE r.status = 'resolved'
       AND r.closed_at > now() - interval '7 days'
    ON CONFLICT (account_id, dedup_key) DO NOTHING
  `);
  return result.count ?? 0;
}
