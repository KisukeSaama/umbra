import "server-only";

import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { isUniqueViolation } from "@/lib/db/errors";
import {
  accounts,
  media,
  mediaRequests,
  type RequestStatus,
} from "@/lib/db/schema";
import { bumpMetric } from "@/lib/domain/analytics";
import { isOnServer } from "@/lib/domain/availability";
import {
  availabilityFor,
  ensureMedia,
  isInLibrary,
  yearOf,
} from "@/lib/domain/catalog";
import { notify } from "@/lib/domain/notifications";
import { trackSeries } from "@/lib/domain/series";
import { ConflictError, ForbiddenError, NotFoundError } from "@/lib/errors";
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
  "processing",
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
  requestedBy: string | null;
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

/**
 * Records a request.
 *
 * Two guards: a title already on the server cannot be requested, and at most
 * one live request exists per title. That uniqueness is carried by a partial
 * index rather than by a prior read another request could slip past.
 */
export async function createRequest(
  kind: MediaKind,
  providerId: string,
  accountId: string,
  language?: string,
): Promise<{ requestId: string; title: string }> {
  const availability = await availabilityFor(kind, providerId);
  // Partly there counts as there: what is missing is asked for season by
  // season, not by requesting the whole title a second time.
  if (isOnServer(availability))
    throw new ConflictError("error.alreadyAvailable");
  if (availability === "requested")
    throw new ConflictError("error.alreadyRequested");

  const summary = await tmdbProvider.details(kind, providerId, language);
  const mediaId = await ensureMedia(summary, language);

  try {
    const [row] = await db()
      .insert(mediaRequests)
      .values({ mediaId, requestedBy: accountId })
      .returning({ id: mediaRequests.id });

    await bumpMetric("requests_created");

    return { requestId: row.id, title: summary.title };
  } catch (error) {
    if (isUniqueViolation(error)) {
      // A concurrent request landed first. What the visitor sees is the same:
      // the title is already requested.
      throw new ConflictError("error.alreadyRequested");
    }
    throw error;
  }
}

/**
 * Withdraws a request, at the asking of the person who opened it.
 *
 * Only while nobody has acted on it: once the administrator has accepted it the
 * work has started, and a member undoing it would erase a decision rather than
 * their own gesture.
 *
 * The row is deleted rather than marked. Nothing has happened to it, so there
 * is no history worth keeping, and the partial unique index that carries "one
 * live request per title" excludes rejected rows alone: a cancelled request has
 * to disappear for the title to be askable again.
 */
export async function cancelRequest(requestId: string, accountId: string) {
  const [deleted] = await db()
    .delete(mediaRequests)
    .where(
      and(
        eq(mediaRequests.id, requestId),
        eq(mediaRequests.requestedBy, accountId),
        eq(mediaRequests.status, "requested"),
      ),
    )
    .returning({ id: mediaRequests.id });

  if (deleted) return { cancelled: true };

  // Nothing was deleted: say which of the three guards refused, so the client
  // can word it rather than showing a bare failure.
  const [row] = await db()
    .select({
      status: mediaRequests.status,
      requestedBy: mediaRequests.requestedBy,
    })
    .from(mediaRequests)
    .where(eq(mediaRequests.id, requestId))
    .limit(1);

  if (!row) throw new NotFoundError("error.requestNotFound");
  if (row.requestedBy !== accountId) throw new ForbiddenError();
  throw new ConflictError("error.requestUnderway");
}

/** One row, as both lists shape it: the queue and a member's own follow-up. */
function toRequestRow(row: {
  id: string;
  status: RequestStatus;
  createdAt: Date;
  updatedAt: Date;
  adminNote: string | null;
  requestedBy: string | null;
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

const REQUEST_COLUMNS = {
  id: mediaRequests.id,
  status: mediaRequests.status,
  createdAt: mediaRequests.createdAt,
  updatedAt: mediaRequests.updatedAt,
  adminNote: mediaRequests.adminNote,
  requestedBy: accounts.username,
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
): Promise<RequestRow[]> {
  const query = db()
    .select(REQUEST_COLUMNS)
    .from(mediaRequests)
    .innerJoin(media, eq(media.id, mediaRequests.mediaId))
    .leftJoin(accounts, eq(accounts.id, mediaRequests.requestedBy))
    .where(
      statuses?.length ? inArray(mediaRequests.status, statuses) : undefined,
    )
    .orderBy(desc(mediaRequests.createdAt));

  const rows = await (window
    ? query.limit(window.limit).offset(window.offset)
    : query);

  return rows.map(toRequestRow);
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
 */
const TRANSITIONS = {
  requested: ["accepted", "processing", "available", "rejected"],
  accepted: ["processing", "available", "rejected"],
  processing: ["available", "rejected"],
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
 *
 * One move is not the administration's to make on its own: `available` says the
 * title is on the server, and it is the only status the search reads as "stop
 * offering this ask". Marking it by hand on a title the sync has never seen
 * closes the request, empties the follow-up page and hands the title straight
 * back to search, where the next member asks for it again. So the state comes
 * from `library_item`, and the button is refused until the sync agrees.
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

  if (
    status === "available" &&
    !(await isInLibrary(subject.mediaType, subject.providerId))
  )
    throw new ConflictError("error.notOnServerYet");

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

  await notifyRequester(requestId, status, subject.title, updated.adminNote);
  return updated;
}

/**
 * Tells the person who asked.
 *
 * The step is part of the notification key, so a request moving through
 * accepted and then available says both things rather than only the first, and
 * a job replaying the same move says nothing twice.
 */
export async function notifyRequester(
  requestId: string,
  status: RequestStatus,
  title: string,
  note?: string | null,
) {
  const [row] = await db()
    .select({ requestedBy: mediaRequests.requestedBy })
    .from(mediaRequests)
    .where(eq(mediaRequests.id, requestId))
    .limit(1);
  if (!row?.requestedBy) return 0;

  return notify([row.requestedBy], {
    kind: "request_status",
    subjectId: requestId,
    step: status,
    payload: note ? { title, status, note } : { title, status },
  });
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
       AND r.status IN ('requested', 'accepted', 'processing')
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
    SELECT r.requested_by,
           'request_status'::text,
           r.id,
           'request_status:' || r.id::text || ':available',
           jsonb_build_object('status', 'available', 'title', m.title)
      FROM media_request AS r
      JOIN media AS m ON m.id = r.media_id
     WHERE r.status = 'available'
       AND r.requested_by IS NOT NULL
       AND r.updated_at > now() - interval '7 days'
    ON CONFLICT (account_id, dedup_key) DO NOTHING
  `);
  return result.count ?? 0;
}

/** The requests one member opened, for their own follow-up page. */
export async function listRequestsBy(
  accountId: string,
  window?: { limit: number; offset: number },
): Promise<RequestRow[]> {
  const query = db()
    .select(REQUEST_COLUMNS)
    .from(mediaRequests)
    .innerJoin(media, eq(media.id, mediaRequests.mediaId))
    .leftJoin(accounts, eq(accounts.id, mediaRequests.requestedBy))
    .where(eq(mediaRequests.requestedBy, accountId))
    .orderBy(desc(mediaRequests.createdAt))
    .$dynamic();

  const rows = await (window
    ? query.limit(window.limit).offset(window.offset)
    : query);

  return rows.map(toRequestRow);
}

/** How many requests this account has ever sent, whatever became of them. */
export async function countRequestsBy(accountId: string): Promise<number> {
  const [row] = await db()
    .select({ count: sql<number>`count(*)::int` })
    .from(mediaRequests)
    .where(eq(mediaRequests.requestedBy, accountId));
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
