import "server-only";

import { and, desc, eq, inArray, notInArray, sql } from "drizzle-orm";

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
import { isOnServer } from "@/lib/domain/availability";
import { availabilityFor, ensureMedia, yearOf } from "@/lib/domain/catalog";
import {
  alternateCutFor,
  matchesProviderId,
  REAL_MATCH_FIRST,
} from "@/lib/domain/library";
import { notify } from "@/lib/domain/notifications";
import { trackSeries } from "@/lib/domain/series";
import { settledAsksFor } from "@/lib/domain/settled";
import { BadRequestError, ConflictError, NotFoundError } from "@/lib/errors";
import type { MediaKind } from "@/lib/providers/metadata";
import { posterUrl, tmdbProvider } from "@/lib/providers/tmdb";
import {
  ASK_REASONS,
  askKey,
  canTransition,
  isAsk,
  isCutReasonAllowed,
  isLive,
  isReasonAllowed,
  isSettled,
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
  /** How many members are waiting on it. For the staff: never shown to members. */
  waiting: number;
  libraryRatingKey: string | null;
  adminNote: string | null;
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
  /*
   * A re-cut answers for a shorter list of things, and for the series alone.
   *
   * Its picture, its tracks and its numbering are the ones whoever made the
   * edit chose, and nothing on this side can put them right; there is no season
   * to point at either, since the page draws no ladder over a numbering of its
   * own. So the rules it is judged by are its own rather than the ones the
   * shape of the report would give it: "an episode is missing" is not a thing
   * one says about a whole series anywhere else, and here it is the whole
   * point. The dialog already offers no more than this, but the route is one
   * request away from anybody.
   */
  const cut = await alternateCutFor(input.kind, input.providerId);
  if (cut) {
    const placed = input.seasonNumber !== null || input.episodeNumber !== null;
    if (placed || !isCutReasonAllowed(input.reason))
      throw new BadRequestError("error.reasonNotAllowed");
  } else {
    const target = targetOf(
      input.kind,
      input.seasonNumber,
      input.episodeNumber,
    );
    if (!isReasonAllowed(target, input.reason))
      throw new BadRequestError("error.reasonNotAllowed");
  }

  // A report is about something that is supposed to be on the server. A title
  // that is not there is a request, and saying so is more useful than refusing.
  const availability = await availabilityFor(input.kind, input.providerId);
  if (!isOnServer(availability)) throw new ConflictError("error.notOnServer");

  /*
   * Asking again for what has just been answered.
   *
   * The pages already hide the ask, but they read a page that may be a minute
   * old and the button is one request away from anybody. The rule lives here as
   * well, so the queue never takes in a second ask for a gap the administration
   * has closed and the next scan is about to confirm. A fault is a different
   * matter: something on the server being wrong has nothing to do with a scan.
   */
  if (isAsk(input.reason) && input.episodeNumber === null) {
    const settled = await settledAsksFor(input.kind, input.providerId);
    if (isSettled(settled, input.seasonNumber))
      throw new ConflictError("error.askSettled");
  }

  const summary = await tmdbProvider.details(
    input.kind,
    input.providerId,
    input.language,
  );
  const mediaId = await ensureMedia(summary, input.language);
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
  if (row) {
    await bumpMetric("reports_created");
    return {
      reportId: row.report_id,
      title: summary.title,
      joined: !row.created,
    };
  }

  /*
   * The one case the statement above cannot answer for itself.
   *
   * Two members reporting the same thing in the same instant: the second
   * insert waits for the first to commit and then does nothing, as it should,
   * but the branch that looks for the report to join reads the snapshot this
   * statement started with, where that report does not exist yet. So it is
   * looked for again, now that the other one has landed, and the person joins
   * what they were told about instead of being refused something they never
   * saw.
   */
  const joined = await joinLiveReport(mediaId, input, input.accountId);
  if (!joined) throw new ConflictError("error.alreadyReported");

  await bumpMetric("reports_created");
  return { reportId: joined, title: summary.title, joined: true };
}

/** Attaches somebody to the live report for one title, place and reason. */
async function joinLiveReport(
  mediaId: string,
  place: {
    seasonNumber: number | null;
    episodeNumber: number | null;
    reason: ReportReason;
  },
  accountId: string,
): Promise<string | null> {
  const [live] = await db()
    .select({ id: reports.id })
    .from(reports)
    .where(
      and(
        eq(reports.mediaId, mediaId),
        sql`coalesce(${reports.seasonNumber}, -1) = coalesce(${place.seasonNumber}::int, -1)`,
        sql`coalesce(${reports.episodeNumber}, -1) = coalesce(${place.episodeNumber}::int, -1)`,
        eq(reports.reason, place.reason),
        inArray(reports.status, [...LIVE_REPORT_STATUSES]),
      ),
    )
    .limit(1);
  if (!live) return null;

  await db()
    .insert(reportFollowers)
    .values({ reportId: live.id, accountId })
    .onConflictDoNothing();
  return live.id;
}

/** The server key of a title, kept on the report so the admin can find it. */
async function serverKeyFor(kind: MediaKind, providerId: string) {
  const [row] = await db()
    .select({ ratingKey: libraryItems.ratingKey })
    .from(libraryItems)
    .where(
      and(
        eq(libraryItems.kind, kind === "movie" ? "movie" : "show"),
        // A re-cut is reachable by the id Umbra worked out from its name, and
        // the administration has to be able to find the entry it points at.
        matchesProviderId(providerId),
      ),
    )
    .orderBy(REAL_MATCH_FIRST)
    .limit(1);
  return row?.ratingKey ?? null;
}

/**
 * What is already being asked about one title.
 *
 * The page has to know, or it offers the same ask again on every visit: the
 * press was answered once, the report was joined rather than duplicated, and
 * the button came back on the next load as though nothing had been said.
 *
 * Read for everybody, not for the person looking: one report carries every
 * member waiting on it, so once it exists the answer is "already asked" no
 * matter who pressed first.
 */
export async function openAsksFor(
  kind: MediaKind,
  providerId: string,
): Promise<string[]> {
  const rows = await db()
    .select({
      seasonNumber: reports.seasonNumber,
      reason: reports.reason,
    })
    .from(reports)
    .innerJoin(media, eq(media.id, reports.mediaId))
    .where(
      and(
        eq(media.providerId, providerId),
        eq(media.mediaType, kind),
        inArray(reports.status, [...LIVE_REPORT_STATUSES]),
      ),
    );

  return [...new Set(rows.map(askKey))];
}

/**
 * Leaves a report, at the asking of someone following it.
 *
 * A report is shared: several members can be waiting on the same one, so
 * withdrawing means leaving it, not destroying what other people are waiting
 * for. The report itself only disappears when it is still untouched and the
 * person leaving was the last one following it, which is exactly the case of
 * the member who has just reported something and changed their mind.
 *
 * Written as one statement, and in that order on purpose: `unfollowed` reads
 * `dropped`, which is what makes Postgres run the deletions one after the
 * other rather than against the same snapshot. When the whole report goes, the
 * follower row goes with it through the cascade instead of being deleted twice.
 */
export async function withdrawReport(reportId: string, accountId: string) {
  const [current] = await db()
    .select({ status: reports.status })
    .from(reports)
    .where(eq(reports.id, reportId))
    .limit(1);
  if (!current) throw new NotFoundError("error.reportNotFound");
  if (!isLive(current.status)) throw new ConflictError("error.reportClosed");

  const rows = await db().execute<{
    dropped: boolean;
    unfollowed: boolean;
  }>(sql`
    WITH dropped AS (
      DELETE FROM report AS r
       WHERE r.id = ${reportId}::uuid
         AND r.status = 'open'
         AND EXISTS (SELECT 1 FROM report_follower AS f
                      WHERE f.report_id = r.id
                        AND f.account_id = ${accountId}::uuid)
         AND NOT EXISTS (SELECT 1 FROM report_follower AS f
                          WHERE f.report_id = r.id
                            AND f.account_id <> ${accountId}::uuid)
      RETURNING r.id
    ),
    unfollowed AS (
      DELETE FROM report_follower
       WHERE report_id = ${reportId}::uuid
         AND account_id = ${accountId}::uuid
         AND NOT EXISTS (SELECT 1 FROM dropped)
      RETURNING report_id
    ),
    forgotten AS (
      DELETE FROM notification
       WHERE account_id = ${accountId}::uuid
         AND subject_id = ${reportId}::uuid
      RETURNING id
    )
    SELECT EXISTS (SELECT 1 FROM dropped) AS dropped,
           EXISTS (SELECT 1 FROM unfollowed) AS unfollowed
  `);

  const row = rows[0];
  // Neither branch touched anything: this member was not following it.
  if (!row?.dropped && !row?.unfollowed)
    throw new NotFoundError("error.reportNotFound");

  return { withdrawn: true, removed: Boolean(row.dropped) };
}

/** How many members are waiting on the report being read, as for requests. */
const waitingColumn = sql<number>`(
  select count(*)::int
    from report_follower as f
   where f.report_id = ${reports.id}
)`;

const REPORT_COLUMNS = {
  waiting: waitingColumn,
  id: reports.id,
  reason: reports.reason,
  status: reports.status,
  seasonNumber: reports.seasonNumber,
  episodeNumber: reports.episodeNumber,
  createdAt: reports.createdAt,
  acknowledgedAt: reports.acknowledgedAt,
  closedAt: reports.closedAt,
  libraryRatingKey: reports.libraryRatingKey,
  adminNote: reports.adminNote,
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
  adminNote: string | null;
  reportedBy: string | null;
  waiting: number;
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
    waiting: row.waiting,
    libraryRatingKey: row.libraryRatingKey,
    adminNote: row.adminNote,
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
  /** The slice to read, when the caller pages. Everything, when it does not. */
  window?: { limit: number; offset: number },
): Promise<ReportRow[]> {
  const query = db()
    .select(REPORT_COLUMNS)
    .from(reports)
    .innerJoin(media, eq(media.id, reports.mediaId))
    .leftJoin(accounts, eq(accounts.id, reports.reportedBy))
    .where(statuses?.length ? inArray(reports.status, statuses) : undefined)
    .orderBy(desc(reports.createdAt));

  const rows = await (window
    ? query.limit(window.limit).offset(window.offset)
    : query);
  return rows.map(toRow);
}

/**
 * Who is waiting on each of these reports, by name, in the order they came.
 *
 * For the staff alone, and read the way `waitingOnRequests` reads requests: one
 * query for a page of the queue, the first name being whoever reported first.
 */
export async function waitingOnReports(
  reportIds: string[],
): Promise<Map<string, string[]>> {
  const waiting = new Map<string, string[]>();
  if (reportIds.length === 0) return waiting;

  const rows = await db()
    .select({ reportId: reportFollowers.reportId, name: accounts.username })
    .from(reportFollowers)
    .innerJoin(accounts, eq(accounts.id, reportFollowers.accountId))
    .where(inArray(reportFollowers.reportId, reportIds))
    .orderBy(reportFollowers.createdAt);

  for (const row of rows) {
    const names = waiting.get(row.reportId) ?? [];
    names.push(row.name);
    waiting.set(row.reportId, names);
  }
  return waiting;
}

/** How many reports the queue holds, for the pager above it. */
export async function countReports(statuses?: ReportStatus[]): Promise<number> {
  const [row] = await db()
    .select({ count: sql<number>`count(*)::int` })
    .from(reports)
    .where(statuses?.length ? inArray(reports.status, statuses) : undefined);
  return row?.count ?? 0;
}

/**
 * Reading a member's rows by the nature of the gesture that made them.
 *
 * Asking for a missing season and reporting a broken track are one table, one
 * queue and one lifecycle, but they are not one gesture, and the follow-up page
 * lists them under two different headings. The split is a reason filter rather
 * than a column, so nothing is written twice and an ask stays exactly the
 * report the administration already works on.
 */
export type ReportNature = "ask" | "fault";

function natureFilter(nature?: ReportNature) {
  if (!nature) return undefined;
  return nature === "ask"
    ? inArray(reports.reason, [...ASK_REASONS])
    : notInArray(reports.reason, [...ASK_REASONS]);
}

/** The reports one member is waiting on, whether they opened them or joined. */
export async function listReportsFollowedBy(
  accountId: string,
  options?: { limit: number; offset: number; nature?: ReportNature },
): Promise<ReportRow[]> {
  const query = db()
    .select(REPORT_COLUMNS)
    .from(reportFollowers)
    .innerJoin(reports, eq(reports.id, reportFollowers.reportId))
    .innerJoin(media, eq(media.id, reports.mediaId))
    .leftJoin(accounts, eq(accounts.id, reports.reportedBy))
    .where(
      and(
        eq(reportFollowers.accountId, accountId),
        natureFilter(options?.nature),
      ),
    )
    .orderBy(desc(reports.createdAt))
    .$dynamic();

  const rows = await (options
    ? query.limit(options.limit).offset(options.offset)
    : query);
  return rows.map(toRow);
}

/** How many reports this account follows, open or long since settled. */
export async function countReportsFollowedBy(
  accountId: string,
  nature?: ReportNature,
): Promise<number> {
  const [row] = await db()
    .select({ count: sql<number>`count(*)::int` })
    .from(reportFollowers)
    .innerJoin(reports, eq(reports.id, reportFollowers.reportId))
    .where(and(eq(reportFollowers.accountId, accountId), natureFilter(nature)));
  return row?.count ?? 0;
}

export async function countOpenReports(): Promise<number> {
  const [row] = await db()
    .select({ count: sql<number>`count(*)::int` })
    .from(reports)
    .where(inArray(reports.status, [...LIVE_REPORT_STATUSES]));
  return row?.count ?? 0;
}

/**
 * What an administrator leaves on a report, if anything.
 *
 * Almost `noteFor` on requests: `undefined` means the note is not part of this
 * move and stays as it is, and an empty string erases it. Where the two part
 * ways is the end. A request that arrives has answered itself, so its note goes
 * with it; a report that closes has not, and the last word is the only place
 * the outcome can be read, whether the problem was fixed, refused or already
 * known. So closing carries a note like any other move, and the way to correct
 * an ageing one is to replace it: there is one note per report, never a thread.
 *
 * Which is why the status is not a parameter here, where `noteFor` on requests
 * needs one: no move a report can make changes what happens to its note.
 */
export function reportNoteFor(
  adminNote?: string | null,
): string | null | undefined {
  if (adminNote === undefined) return undefined;
  return adminNote?.trim() || null;
}

/**
 * Rewrites the note alone, without moving the report.
 *
 * The same second gesture as `setRequestNote`, and for the same reason: a word
 * written while taking a report up ages, and correcting it should not mean
 * pushing the report into a status it does not belong in. Rewriting drops what
 * was there, since a report carries one note and not a history. Nothing is
 * announced, since the notification key carries the step and the step has not
 * changed.
 */
export async function setReportNote(
  reportId: string,
  adminNote: string | null,
) {
  const [updated] = await db()
    .update(reports)
    .set({ adminNote: adminNote?.trim() || null, updatedAt: new Date() })
    .where(eq(reports.id, reportId))
    .returning({
      id: reports.id,
      status: reports.status,
      adminNote: reports.adminNote,
    });
  if (!updated) throw new NotFoundError("error.reportNotFound");

  return updated;
}

/**
 * Moves a report.
 *
 * Taking up a series report starts tracking it, the way accepting a request
 * does: without a calendar the two reasons that could settle themselves never
 * would, and the report would sit open for nothing.
 *
 * A re-cut is the exception, and it matters: what a re-cut is filed under is
 * the provider id of the series it was cut from, so putting that series under
 * watch pulls the calendar of a thousand episodes for a hundred the edit kept
 * on purpose. Every one of them then reads as aired and absent, one task is
 * opened per episode, and the report can never settle because the calendar it
 * would be measured against is not its own. A re-cut has no calendar to be
 * late on: see `docs/product.md`.
 *
 * Taking one up may carry a word for everyone waiting on it, which reaches them
 * in their notification and on their follow-up page.
 */
export async function updateReportStatus(
  reportId: string,
  status: ReportStatus,
  adminNote?: string | null,
) {
  const [current] = await db()
    .select({ status: reports.status, mediaId: reports.mediaId })
    .from(reports)
    .where(eq(reports.id, reportId))
    .limit(1);
  if (!current) throw new NotFoundError("error.reportNotFound");
  if (!canTransition(current.status, status))
    throw new ConflictError("error.illegalTransition");

  const note = reportNoteFor(adminNote);
  const now = new Date();
  const closing =
    status === "resolved" || status === "rejected" || status === "duplicate";
  const [updated] = await db()
    .update(reports)
    .set({
      status,
      ...(note === undefined ? {} : { adminNote: note }),
      updatedAt: now,
      acknowledgedAt: status === "acknowledged" ? now : undefined,
      closedAt: closing ? now : undefined,
    })
    // The status this move started from is part of the condition: two people on
    // the queue at once would otherwise both pass the check above, and the
    // second write would quietly bury the first decision.
    .where(and(eq(reports.id, reportId), eq(reports.status, current.status)))
    .returning({
      id: reports.id,
      status: reports.status,
      adminNote: reports.adminNote,
    });

  if (!updated) throw new ConflictError("error.illegalTransition");

  if (status === "acknowledged") {
    const [row] = await db()
      .select({ providerId: media.providerId, mediaType: media.mediaType })
      .from(media)
      .where(eq(media.id, current.mediaId))
      .limit(1);

    if (row?.mediaType === "tv") {
      const cut = await alternateCutFor("tv", row.providerId);
      if (!cut) {
        // A provider that does not answer must not undo the decision that has
        // just been written: `trackAcceptedSeries` is not this row's keeper, so
        // this is said out loud and the administration can take it up again.
        try {
          await trackSeries(row.providerId);
        } catch (error) {
          console.warn(
            `[reports] tracking failed providerId=${row.providerId}`,
            error,
          );
        }
      }
    }
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
      adminNote: reports.adminNote,
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
        ...(first.adminNote ? { note: first.adminNote } : {}),
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
/**
 * The match is an `EXISTS` rather than an `UPDATE ... FROM` with joins.
 *
 * Postgres refuses a reference to the row being updated inside the `ON` of a
 * join in the `FROM` clause, and it refuses it at parse time, so the statement
 * never ran once. That failure was not local: this runs inside the library
 * sync, and everything the sync does after it, the poster and genre backfill
 * included, stopped running with it. The picker reads those genres, which is
 * how a broken join here became a guided selection that ignored the mood.
 *
 * The alias is also not `show`: that word is a reserved statement keyword.
 */
export async function closeReportsSolvedByLibrary(): Promise<number> {
  const result = await db().execute(sql`
    UPDATE report AS r
       SET status = 'resolved', closed_at = now(), updated_at = now()
     WHERE r.reason = 'missing_episode'
       AND r.status IN ('open', 'acknowledged', 'in_progress')
       AND EXISTS (
         SELECT 1
           FROM media AS m
           JOIN library_item AS parent
             ON parent.kind = 'show'
            AND parent.tmdb_id = m.provider_id
           JOIN library_item AS ep
             ON ep.kind = 'episode'
            AND ep.grandparent_rating_key = parent.rating_key
          WHERE m.id = r.media_id
            AND ep.season_number = r.season_number
            AND ep.episode_number = r.episode_number
       )
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

/** When the last report came in, whatever became of it. */
export async function lastReportAt(): Promise<Date | null> {
  const [row] = await db()
    .select({ createdAt: reports.createdAt })
    .from(reports)
    .orderBy(desc(reports.createdAt))
    .limit(1);
  return row?.createdAt ?? null;
}
