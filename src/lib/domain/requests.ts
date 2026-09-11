import "server-only";

import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  accounts,
  media,
  mediaRequests,
  requestFollowers,
  type RequestStatus,
} from "@/lib/db/schema";
import { bumpMetric } from "@/lib/domain/analytics";
import { isOnServer } from "@/lib/domain/availability";
import {
  availabilityFor,
  ensureMedia,
  yearOf,
} from "@/lib/domain/catalog";
import { notify } from "@/lib/domain/notifications";
import { trackSeries } from "@/lib/domain/series";
import { ConflictError, ForbiddenError, NotFoundError } from "@/lib/errors";
import type { QueueOrder } from "@/lib/queue";
import type { MediaKind } from "@/lib/providers/metadata";
import { posterUrl, tmdbProvider } from "@/lib/providers/tmdb";

/**
 * A request the administration still has something to do about.
 *
 * The mirror of `LIVE_REPORT_STATUSES`. A report taken up stays in the queue
 * until it is closed, and a request had been leaving it the moment it was
 * accepted: the work was starting exactly when the row disappeared, and what
 * was in hand could only be found again by opening the section and reading
 * every line that had ever been written. Being worked on is not being done.
 */
export const LIVE_REQUEST_STATUSES = [
  "requested",
  "accepted",
] as const;

export function isLiveRequest(status: RequestStatus): boolean {
  return (LIVE_REQUEST_STATUSES as readonly RequestStatus[]).includes(status);
}

export type RequestRow = {
  id: string;
  status: RequestStatus;
  createdAt: Date;
  updatedAt: Date;
  adminNote: string | null;
  /** Who opened it, or whoever it was handed to when they left. */
  requestedBy: string | null;
  /** How many members are waiting on it. For the staff: never shown to members. */
  waiting: number;
  /** The server holds the title, so the request may be declared fulfilled. */
  inLibrary: boolean;
  media: {
    providerId: string;
    kind: MediaKind;
    title: string;
    year: number | null;
    posterUrl: string | null;
  };
};

/** What asking for a title answers: the request, and whether it was joined. */
export type RequestOutcome = {
  requestId: string;
  title: string;
  status: RequestStatus;
  /** True when the request already existed and this member joined it. */
  joined: boolean;
};

/**
 * Records a request, or joins the one that already exists.
 *
 * A title already on the server cannot be requested, and at most one live
 * request exists per title, carried by a partial index rather than by a prior
 * read another request could slip past. A second member asking for the same
 * title is not turned away: they join the live request, hear about each of its
 * steps, and count towards the number the staff read to decide what to fetch
 * first. See `docs/adr/0016-requests-have-followers.md`.
 *
 * Written as one statement for the same reason as `createReport`: two members
 * pressing at the same instant get one request and two followers.
 */
export async function createRequest(
  kind: MediaKind,
  providerId: string,
  accountId: string,
  language?: string,
): Promise<RequestOutcome> {
  const availability = await availabilityFor(kind, providerId);
  // Partly there counts as there: what is missing is asked for season by
  // season, not by requesting the whole title a second time.
  if (isOnServer(availability))
    throw new ConflictError("error.alreadyAvailable");

  // Already on the list, so the title is known and joining needs no provider
  // call. Refused in the meantime, the title is askable again: carry on.
  if (availability === "requested") {
    const joined = await joinLiveRequest(kind, providerId, accountId);
    if (joined) return joined;
  }

  const summary = await tmdbProvider.details(kind, providerId, language);
  const mediaId = await ensureMedia(summary, language);

  const rows = await db().execute<{
    request_id: string;
    status: RequestStatus;
    created: boolean;
  }>(sql`
    WITH inserted AS (
      INSERT INTO media_request (media_id, requested_by)
      VALUES (${mediaId}::uuid, ${accountId}::uuid)
      ON CONFLICT (media_id) WHERE status <> 'rejected'
      DO NOTHING
      RETURNING id, status
    ),
    chosen AS (
      SELECT id, status, TRUE AS created FROM inserted
      UNION ALL
      SELECT r.id, r.status, FALSE FROM media_request AS r
       WHERE NOT EXISTS (SELECT 1 FROM inserted)
         AND r.media_id = ${mediaId}::uuid
         AND r.status <> 'rejected'
    ),
    followed AS (
      INSERT INTO request_follower (request_id, account_id)
      SELECT id, ${accountId}::uuid FROM chosen
      ON CONFLICT DO NOTHING
      RETURNING request_id
    )
    SELECT id AS request_id, status, created FROM chosen
  `);

  const row = rows[0];
  if (row) {
    if (row.created) await bumpMetric("requests_created");
    return {
      requestId: row.request_id,
      title: summary.title,
      status: row.status,
      joined: !row.created,
    };
  }

  /*
   * Two members asking in the same instant. The second insert waits for the
   * first to commit and then does nothing, but the branch that looks for the
   * request to join reads the snapshot the statement started with, where it
   * does not exist yet. So it is looked for again, now that it has landed.
   */
  const joined = await joinLiveRequest(kind, providerId, accountId);
  if (!joined) throw new ConflictError("error.alreadyRequested");
  return joined;
}

/** Attaches somebody to the live request for one title, if there is one. */
async function joinLiveRequest(
  kind: MediaKind,
  providerId: string,
  accountId: string,
): Promise<RequestOutcome | null> {
  const [live] = await db()
    .select({
      id: mediaRequests.id,
      status: mediaRequests.status,
      title: media.title,
    })
    .from(mediaRequests)
    .innerJoin(media, eq(media.id, mediaRequests.mediaId))
    .where(
      and(
        eq(media.providerId, providerId),
        eq(media.mediaType, kind),
        ne(mediaRequests.status, "rejected"),
      ),
    )
    .limit(1);
  if (!live) return null;

  await db()
    .insert(requestFollowers)
    .values({ requestId: live.id, accountId })
    .onConflictDoNothing();
  return {
    requestId: live.id,
    title: live.title,
    status: live.status,
    joined: true,
  };
}

/**
 * Leaves a request, at the asking of someone waiting on it.
 *
 * Only while nobody has acted on it: once the administrator has accepted it the
 * work has started, and a member undoing it would erase a decision rather than
 * their own gesture.
 *
 * A request is shared, so leaving is not deleting. The row only goes when the
 * person leaving was the last one waiting on it, which is the member who has
 * just asked and changed their mind. It is deleted rather than marked then:
 * nothing has happened to it, and the partial unique index that carries "one
 * live request per title" excludes rejected rows alone, so a cancelled request
 * has to disappear for the title to be askable again.
 *
 * When the person who opened it leaves and others stay, it is handed to whoever
 * joined next, so the queue never names somebody who is no longer waiting.
 *
 * One statement, in that order on purpose, as in `withdrawReport`: every branch
 * after `dropped` reads it, which is what makes them run after it rather than
 * against the same snapshot. Each also checks the status again, so a request
 * accepted between the read below and this write is left alone.
 */
export async function withdrawRequest(requestId: string, accountId: string) {
  const [current] = await db()
    .select({
      status: mediaRequests.status,
      following: sql<boolean>`exists (
        select 1 from request_follower as f
         where f.request_id = ${mediaRequests.id}
           and f.account_id = ${accountId}::uuid
      )`,
    })
    .from(mediaRequests)
    .where(eq(mediaRequests.id, requestId))
    .limit(1);

  // Say which guard refused, so the client can word it rather than showing a
  // bare failure.
  if (!current) throw new NotFoundError("error.requestNotFound");
  if (!current.following) throw new ForbiddenError();
  if (current.status !== "requested")
    throw new ConflictError("error.requestUnderway");

  const rows = await db().execute<{
    dropped: boolean;
    unfollowed: boolean;
  }>(sql`
    WITH dropped AS (
      DELETE FROM media_request AS r
       WHERE r.id = ${requestId}::uuid
         AND r.status = 'requested'
         AND NOT EXISTS (SELECT 1 FROM request_follower AS f
                          WHERE f.request_id = r.id
                            AND f.account_id <> ${accountId}::uuid)
      RETURNING r.id
    ),
    unfollowed AS (
      DELETE FROM request_follower AS f
       WHERE f.request_id = ${requestId}::uuid
         AND f.account_id = ${accountId}::uuid
         AND NOT EXISTS (SELECT 1 FROM dropped)
         AND EXISTS (SELECT 1 FROM media_request AS r
                      WHERE r.id = f.request_id
                        AND r.status = 'requested')
      RETURNING f.request_id
    ),
    handed AS (
      UPDATE media_request AS r
         SET requested_by = (
               SELECT f.account_id FROM request_follower AS f
                WHERE f.request_id = r.id
                  AND f.account_id <> ${accountId}::uuid
                ORDER BY f.created_at
                LIMIT 1)
       WHERE r.id = ${requestId}::uuid
         AND r.status = 'requested'
         AND r.requested_by = ${accountId}::uuid
         AND NOT EXISTS (SELECT 1 FROM dropped)
      RETURNING r.id
    ),
    forgotten AS (
      DELETE FROM notification
       WHERE account_id = ${accountId}::uuid
         AND subject_id = ${requestId}::uuid
         AND (EXISTS (SELECT 1 FROM dropped)
              OR EXISTS (SELECT 1 FROM unfollowed))
      RETURNING id
    )
    SELECT EXISTS (SELECT 1 FROM dropped) AS dropped,
           EXISTS (SELECT 1 FROM unfollowed) AS unfollowed
  `);

  const row = rows[0];
  // Neither branch touched anything: it was taken up in the meantime.
  if (!row?.dropped && !row?.unfollowed)
    throw new ConflictError("error.requestUnderway");

  return { cancelled: true, removed: Boolean(row.dropped) };
}

/**
 * The live request one member is waiting on for a title, if any.
 *
 * The title page needs it to tell "you asked for this" from "somebody did", and
 * to offer joining in the second case rather than a dead end.
 */
export async function followedRequestFor(
  kind: MediaKind,
  providerId: string,
  accountId: string,
): Promise<{ id: string; status: RequestStatus } | null> {
  const [row] = await db()
    .select({ id: mediaRequests.id, status: mediaRequests.status })
    .from(requestFollowers)
    .innerJoin(mediaRequests, eq(mediaRequests.id, requestFollowers.requestId))
    .innerJoin(media, eq(media.id, mediaRequests.mediaId))
    .where(
      and(
        eq(requestFollowers.accountId, accountId),
        eq(media.providerId, providerId),
        eq(media.mediaType, kind),
        ne(mediaRequests.status, "rejected"),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * How many members are waiting on the live request for a title, 0 when none.
 *
 * Shown on the title page alone, beside the ask, so a member who finds a title
 * somebody already asked for sees that joining is worth it. Never a ranking,
 * never on a card. See `docs/adr/0016-requests-have-followers.md`.
 */
export async function waitingOnTitle(
  kind: MediaKind,
  providerId: string,
): Promise<number> {
  const [row] = await db()
    .select({ count: sql<number>`count(*)::int` })
    .from(requestFollowers)
    .innerJoin(mediaRequests, eq(mediaRequests.id, requestFollowers.requestId))
    .innerJoin(media, eq(media.id, mediaRequests.mediaId))
    .where(
      and(
        eq(media.providerId, providerId),
        eq(media.mediaType, kind),
        ne(mediaRequests.status, "rejected"),
      ),
    );
  return row?.count ?? 0;
}

/** One row, as both lists shape it: the queue and a member's own follow-up. */
function toRequestRow(row: {
  id: string;
  status: RequestStatus;
  createdAt: Date;
  updatedAt: Date;
  adminNote: string | null;
  requestedBy: string | null;
  waiting: number;
  inLibrary: boolean;
  providerId: string;
  mediaType: MediaKind;
  title: string;
  releaseDate: string | null;
  posterPath: string | null;
}): RequestRow {
  return {
    id: row.id,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    adminNote: row.adminNote,
    requestedBy: row.requestedBy,
    waiting: row.waiting,
    inLibrary: row.inLibrary,
    media: {
      providerId: row.providerId,
      kind: row.mediaType,
      title: row.title,
      year: yearOf(row.releaseDate),
      posterUrl: posterUrl(row.posterPath),
    },
  };
}

/**
 * Whether the server holds the title of the request being read.
 *
 * Asked as an existence rather than as a join: one library row is enough, and a
 * join would repeat the request once per matching row.
 */
const inLibraryColumn = sql<boolean>`exists (
  select 1
    from library_item as l
   where l.tmdb_id = ${media.providerId}
     and l.kind = case ${media.mediaType} when 'movie' then 'movie' else 'show' end
)`;

/**
 * How many members are waiting on the request being read.
 *
 * A correlated count rather than a join and a group: the list already joins
 * the media and the account, and grouping over both to count a third table is
 * a heavier query for the same number.
 */
const waitingColumn = sql<number>`(
  select count(*)::int
    from request_follower as f
   where f.request_id = ${mediaRequests.id}
)`;

const REQUEST_COLUMNS = {
  id: mediaRequests.id,
  status: mediaRequests.status,
  createdAt: mediaRequests.createdAt,
  updatedAt: mediaRequests.updatedAt,
  adminNote: mediaRequests.adminNote,
  requestedBy: accounts.username,
  waiting: waitingColumn,
  providerId: media.providerId,
  mediaType: media.mediaType,
  title: media.title,
  releaseDate: media.releaseDate,
  posterPath: media.posterPath,
  inLibrary: inLibraryColumn,
};

export async function listRequests(
  statuses?: RequestStatus[],
  /** The slice to read, when the caller pages. Everything, when it does not. */
  window?: { limit: number; offset: number },
  /** Newest first by default; `wanted` puts the most followed first. */
  order: QueueOrder = "recent",
): Promise<RequestRow[]> {
  const query = db()
    .select(REQUEST_COLUMNS)
    .from(mediaRequests)
    .innerJoin(media, eq(media.id, mediaRequests.mediaId))
    .leftJoin(accounts, eq(accounts.id, mediaRequests.requestedBy))
    .where(
      statuses?.length ? inArray(mediaRequests.status, statuses) : undefined,
    )
    .orderBy(
      ...(order === "wanted" ? [desc(waitingColumn)] : []),
      desc(mediaRequests.createdAt),
    );

  const rows = await (window
    ? query.limit(window.limit).offset(window.offset)
    : query);

  return rows.map(toRequestRow);
}

/**
 * Who is waiting on each of these requests, by name, in the order they asked.
 *
 * For the staff alone. One query for a whole page of the queue rather than one
 * per row, and the first name is whoever opened the request, or whoever it was
 * handed to when they left.
 */
export async function waitingOnRequests(
  requestIds: string[],
): Promise<Map<string, string[]>> {
  const waiting = new Map<string, string[]>();
  if (requestIds.length === 0) return waiting;

  const rows = await db()
    .select({
      requestId: requestFollowers.requestId,
      name: accounts.username,
    })
    .from(requestFollowers)
    .innerJoin(accounts, eq(accounts.id, requestFollowers.accountId))
    .where(inArray(requestFollowers.requestId, requestIds))
    .orderBy(requestFollowers.createdAt);

  for (const row of rows) {
    const names = waiting.get(row.requestId) ?? [];
    names.push(row.name);
    waiting.set(row.requestId, names);
  }
  return waiting;
}

/** A request the staff took up, as every member may see it on the home page. */
export type InProgressRequest = {
  id: string;
  media: RequestRow["media"];
};

/**
 * What the staff took up and the server does not hold yet.
 *
 * The public face of the queue: a title, never who asked, how many are waiting,
 * or the note left on it. The most recently taken up come first. One the
 * library already holds is left out: the sync is about to close it, and the
 * home page would announce as coming something already there.
 */
export async function inProgressRequests(
  limit: number,
): Promise<InProgressRequest[]> {
  const rows = await db()
    .select(REQUEST_COLUMNS)
    .from(mediaRequests)
    .innerJoin(media, eq(media.id, mediaRequests.mediaId))
    .leftJoin(accounts, eq(accounts.id, mediaRequests.requestedBy))
    .where(
      and(
        eq(mediaRequests.status, "accepted"),
        sql`not ${inLibraryColumn}`,
      ),
    )
    .orderBy(desc(mediaRequests.updatedAt))
    .limit(limit);

  return rows.map((row) => {
    const request = toRequestRow(row);
    return { id: request.id, media: request.media };
  });
}

/** Requests still on the desk, for the figure the navigation carries. */
export async function countLiveRequests(): Promise<number> {
  const [row] = await db()
    .select({ count: sql<number>`count(*)::int` })
    .from(mediaRequests)
    .where(inArray(mediaRequests.status, [...LIVE_REQUEST_STATUSES]));
  return row?.count ?? 0;
}

/** How many requests the queue holds, for the pager above it. */
export async function countRequests(
  statuses?: RequestStatus[],
): Promise<number> {
  const [row] = await db()
    .select({ count: sql<number>`count(*)::int` })
    .from(mediaRequests)
    .where(
      statuses?.length ? inArray(mediaRequests.status, statuses) : undefined,
    );
  return row?.count ?? 0;
}

/**
 * What an administrator leaves on a request, if anything.
 *
 * `undefined` means the note is not part of this move and stays as it is, an
 * empty string erases it, and reaching the server erases it whatever was sent:
 * a word explaining that something is being looked for has nothing left to say
 * once it is there. That is also the only free text in the product, and it
 * goes one way, from the administration to the person who asked.
 */
export function noteFor(
  status: RequestStatus,
  adminNote?: string | null,
): string | null | undefined {
  if (status === "available") return null;
  if (adminNote === undefined) return undefined;
  return adminNote?.trim() || null;
}

/**
 * Rewrites the note alone, without moving the request.
 *
 * A word left when taking an ask in hand ages: what was being looked for is
 * found, the season that was missing has a date. Saying so used to mean moving
 * the request somewhere it does not belong, so the note is editable for as long
 * as it is displayed, which is until the title reaches the server.
 *
 * Nothing is announced: the step already told the member, and the notification
 * key carries that step, so a second one about the same move would be swallowed
 * anyway. The new wording is on their follow-up page, where they read it.
 */
export async function setRequestNote(
  requestId: string,
  adminNote: string | null,
) {
  const [current] = await db()
    .select({ status: mediaRequests.status })
    .from(mediaRequests)
    .where(eq(mediaRequests.id, requestId))
    .limit(1);
  if (!current) throw new NotFoundError("error.requestNotFound");
  if (!canCarryNote(current.status))
    throw new ConflictError("error.noteNotEditable");

  const [updated] = await db()
    .update(mediaRequests)
    .set({ adminNote: adminNote?.trim() || null, updatedAt: new Date() })
    .where(eq(mediaRequests.id, requestId))
    .returning({
      id: mediaRequests.id,
      status: mediaRequests.status,
      adminNote: mediaRequests.adminNote,
    });

  return updated;
}

/** The note lives as long as it is shown, and arriving is what erases it. */
export function canCarryNote(status: RequestStatus): boolean {
  return status !== "available";
}

/**
 * Where a request may go from where it is.
 *
 * The lifecycle in `docs/product.md` only ever moves forward, and it used to be
 * a drawing rather than a rule: any status was accepted from any status. Two of
 * those moves did real damage. `available` back to `requested` handed a title
 * that is on the server back to the queue and told the member about a step they
 * had already been told about; `rejected` back to a live status collided with
 * the partial unique index that carries "one live request per title", which
 * answered the administrator with a server error.
 *
 * Refusing something declined is not a dead end for the member: a rejected
 * request leaves the title askable, so what happens next is a new request
 * rather than a resurrection of the old one.
 *
 * `available` is not a move anyone makes. It says the title is on the server,
 * which is the one status search reads as "stop offering this ask", so it is
 * only ever written by the sync, from what `library_item` holds
 * (`closeRequestsPresentInLibrary`). A request closed by hand on a title the
 * sync has never seen would empty the follow-up page and hand the title
 * straight back to search, where the next member asks for it again.
 */
const TRANSITIONS = {
  requested: ["accepted", "rejected"],
  accepted: ["rejected"],
  available: [],
  rejected: [],
} satisfies Record<RequestStatus, RequestStatus[]>;

export function nextRequestStatuses(
  from: RequestStatus,
): readonly RequestStatus[] {
  return TRANSITIONS[from];
}

export function canMoveRequest(
  from: RequestStatus,
  to: RequestStatus,
): boolean {
  return nextRequestStatuses(from).includes(to);
}

/**
 * Moves a request to another status.
 *
 * Accepting a series starts tracking it: this is where the Series Tracker takes
 * over (see `docs/product.md`).
 */
export async function updateRequestStatus(
  requestId: string,
  status: RequestStatus,
  adminNote?: string | null,
) {
  const note = noteFor(status, adminNote);

  const [subject] = await db()
    .select({
      status: mediaRequests.status,
      providerId: media.providerId,
      mediaType: media.mediaType,
      title: media.title,
    })
    .from(mediaRequests)
    .innerJoin(media, eq(media.id, mediaRequests.mediaId))
    .where(eq(mediaRequests.id, requestId))
    .limit(1);

  if (!subject) throw new NotFoundError("error.requestNotFound");
  if (!canMoveRequest(subject.status, status))
    throw new ConflictError("error.illegalTransition");

  const [updated] = await db()
    .update(mediaRequests)
    .set({
      status,
      ...(note === undefined ? {} : { adminNote: note }),
      updatedAt: new Date(),
    })
    // The status this move started from is part of the condition: two people
    // on the queue at once would otherwise both pass the check above and the
    // second write would quietly overwrite the first decision.
    .where(
      and(
        eq(mediaRequests.id, requestId),
        eq(mediaRequests.status, subject.status),
      ),
    )
    .returning({
      id: mediaRequests.id,
      mediaId: mediaRequests.mediaId,
      status: mediaRequests.status,
      adminNote: mediaRequests.adminNote,
    });

  if (!updated) throw new ConflictError("error.illegalTransition");

  /*
   * Starting the tracker is a consequence of the decision, not part of it.
   *
   * It calls the metadata provider, and a provider that does not answer used
   * to take the whole move down with it: the row had already changed, the
   * administrator saw a gateway error, and the member was never told. So a
   * failure here is recorded and left to `trackAcceptedSeries`, which picks up
   * on the next cycle exactly the series this should have started.
   */
  if (status === "accepted" && subject.mediaType === "tv") {
    try {
      await trackSeries(subject.providerId);
    } catch (error) {
      console.warn(
        `[requests] tracking deferred providerId=${subject.providerId}`,
        error,
      );
    }
  }

  await notifyRequestFollowers(
    requestId,
    status,
    subject.title,
    updated.adminNote,
  );
  return updated;
}

/**
 * Tells everyone waiting on a request, the person who opened it included.
 *
 * The step is part of the notification key, so a request moving through
 * accepted and then available says both things rather than only the first, and
 * a job replaying the same move says nothing twice.
 */
export async function notifyRequestFollowers(
  requestId: string,
  status: RequestStatus,
  title: string,
  note?: string | null,
) {
  const rows = await db()
    .select({ accountId: requestFollowers.accountId })
    .from(requestFollowers)
    .where(eq(requestFollowers.requestId, requestId));
  if (rows.length === 0) return 0;

  return notify(
    rows.map((row) => row.accountId),
    {
      kind: "request_status",
      subjectId: requestId,
      step: status,
      payload: note ? { title, status, note } : { title, status },
    },
  );
}

/**
 * Closes requests whose title has appeared on the server. Called by the library
 * sync, so nothing has to be closed by hand, and it clears the administrator
 * note on the way out for the same reason `updateRequestStatus` does.
 */
export async function closeRequestsPresentInLibrary(): Promise<number> {
  const result = await db().execute(sql`
    UPDATE media_request AS r
       SET status = 'available',
           admin_note = NULL,
           updated_at = now()
      FROM media AS m
      JOIN library_item AS l
        ON l.tmdb_id = m.provider_id
       AND l.kind = CASE m.media_type WHEN 'movie' THEN 'movie' ELSE 'show' END
     WHERE r.media_id = m.id
       AND r.status IN ('requested', 'accepted')
  `);
  return result.count ?? 0;
}

/**
 * Tells everyone whose request has landed on the server.
 *
 * Kept apart from the closing statement so a job never holds a list in memory,
 * and safe to rerun because the notification key already carries the step.
 */
export async function notifyArrivedRequests(): Promise<number> {
  const result = await db().execute(sql`
    INSERT INTO notification (account_id, kind, subject_id, dedup_key, payload)
    SELECT f.account_id,
           'request_status'::text,
           r.id,
           'request_status:' || r.id::text || ':available',
           jsonb_build_object('status', 'available', 'title', m.title)
      FROM media_request AS r
      JOIN request_follower AS f ON f.request_id = r.id
      JOIN media AS m ON m.id = r.media_id
     WHERE r.status = 'available'
       AND r.updated_at > now() - interval '7 days'
    ON CONFLICT (account_id, dedup_key) DO NOTHING
  `);
  return result.count ?? 0;
}

/** The requests one member is waiting on, whether they opened them or joined. */
export async function listRequestsBy(
  accountId: string,
  window?: { limit: number; offset: number },
): Promise<RequestRow[]> {
  const query = db()
    .select(REQUEST_COLUMNS)
    .from(requestFollowers)
    .innerJoin(mediaRequests, eq(mediaRequests.id, requestFollowers.requestId))
    .innerJoin(media, eq(media.id, mediaRequests.mediaId))
    .leftJoin(accounts, eq(accounts.id, mediaRequests.requestedBy))
    .where(eq(requestFollowers.accountId, accountId))
    .orderBy(desc(mediaRequests.createdAt))
    .$dynamic();

  const rows = await (window
    ? query.limit(window.limit).offset(window.offset)
    : query);

  return rows.map(toRequestRow);
}

/** How many requests this account waits or waited on, whatever became of them. */
export async function countRequestsBy(accountId: string): Promise<number> {
  const [row] = await db()
    .select({ count: sql<number>`count(*)::int` })
    .from(requestFollowers)
    .where(eq(requestFollowers.accountId, accountId));
  return row?.count ?? 0;
}

/** When the last request came in, whatever became of it. */
export async function lastRequestAt(): Promise<Date | null> {
  const [row] = await db()
    .select({ createdAt: mediaRequests.createdAt })
    .from(mediaRequests)
    .orderBy(desc(mediaRequests.createdAt))
    .limit(1);
  return row?.createdAt ?? null;
}
