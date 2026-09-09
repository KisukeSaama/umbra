import "server-only";

import { desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { isUniqueViolation } from "@/lib/db/errors";
import {
  accounts,
  media,
  mediaRequests,
  type RequestStatus,
} from "@/lib/db/schema";
import { bumpMetric } from "@/lib/domain/analytics";
import { availabilityFor, ensureMedia, yearOf } from "@/lib/domain/catalog";
import { notify } from "@/lib/domain/notifications";
import { trackSeries } from "@/lib/domain/series";
import { ConflictError, NotFoundError } from "@/lib/errors";
import type { MediaKind } from "@/lib/providers/metadata";
import { posterUrl, tmdbProvider } from "@/lib/providers/tmdb";

export type RequestRow = {
  id: string;
  status: RequestStatus;
  createdAt: Date;
  updatedAt: Date;
  adminNote: string | null;
  requestedBy: string | null;
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
  if (availability === "available")
    throw new ConflictError("error.alreadyAvailable");
  if (availability === "requested")
    throw new ConflictError("error.alreadyRequested");

  const summary = await tmdbProvider.details(kind, providerId, language);
  const mediaId = await ensureMedia(summary);

  try {
    const [row] = await db()
      .insert(mediaRequests)
      .values({ mediaId, requestedBy: accountId })
      .returning({ id: mediaRequests.id });

    await bumpMetric("requests_created");
    await notify({
      kind: "request",
      title: `New Umbra request: ${summary.title}`,
      body: [kind === "movie" ? "Movie" : "Series", yearOf(summary.releaseDate)]
        .filter(Boolean)
        .join(" - "),
    });

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

export async function listRequests(
  statuses?: RequestStatus[],
): Promise<RequestRow[]> {
  const rows = await db()
    .select({
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
    })
    .from(mediaRequests)
    .innerJoin(media, eq(media.id, mediaRequests.mediaId))
    .leftJoin(accounts, eq(accounts.id, mediaRequests.requestedBy))
    .where(
      statuses?.length ? inArray(mediaRequests.status, statuses) : undefined,
    )
    .orderBy(desc(mediaRequests.createdAt));

  return rows.map((row) => ({
    id: row.id,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    adminNote: row.adminNote,
    requestedBy: row.requestedBy,
    media: {
      providerId: row.providerId,
      kind: row.mediaType,
      title: row.title,
      year: yearOf(row.releaseDate),
      posterUrl: posterUrl(row.posterPath),
    },
  }));
}

export async function countRequestsByStatus(): Promise<
  Record<RequestStatus, number>
> {
  const rows = await db()
    .select({ status: mediaRequests.status, count: sql<number>`count(*)::int` })
    .from(mediaRequests)
    .groupBy(mediaRequests.status);

  const counts = {
    requested: 0,
    accepted: 0,
    processing: 0,
    available: 0,
    rejected: 0,
  } satisfies Record<RequestStatus, number>;
  for (const row of rows) counts[row.status] = row.count;
  return counts;
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
  const [updated] = await db()
    .update(mediaRequests)
    .set({ status, adminNote: adminNote ?? undefined, updatedAt: new Date() })
    .where(eq(mediaRequests.id, requestId))
    .returning({
      id: mediaRequests.id,
      mediaId: mediaRequests.mediaId,
      status: mediaRequests.status,
    });

  if (!updated) throw new NotFoundError("error.requestNotFound");

  if (status === "accepted") {
    const [row] = await db()
      .select({ providerId: media.providerId, mediaType: media.mediaType })
      .from(media)
      .where(eq(media.id, updated.mediaId))
      .limit(1);
    if (row?.mediaType === "tv") await trackSeries(row.providerId);
  }

  return updated;
}

/**
 * Closes requests whose title has appeared on the server. Called by the library
 * sync, so nothing has to be closed by hand.
 */
export async function closeRequestsPresentInLibrary(): Promise<number> {
  const result = await db().execute(sql`
    UPDATE media_request AS r
       SET status = 'available',
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
