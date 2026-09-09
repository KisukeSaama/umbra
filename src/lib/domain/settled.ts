import "server-only";

import { and, eq, gt, inArray, isNull, notExists, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "@/lib/db";
import { media, reports } from "@/lib/db/schema";
import type { MediaKind } from "@/lib/providers/metadata";
import {
  ASK_REASONS,
  LIVE_REPORT_STATUSES,
  NOTHING_SETTLED,
  type SettledAsks,
} from "@/lib/reports/reasons";

/**
 * What the administration has answered and the index has not seen yet.
 *
 * Presence is read from `library_item`, which the sync fills, so between the
 * moment an ask is done and the moment the next scan runs the search still
 * shows the gap it no longer has. That window is not a display nicety: a member
 * looking at it is offered the very ask that has just been answered, and sends
 * it again.
 *
 * So a resolved ask speaks for the index until the index can speak for itself.
 * The claim is bounded by the two passes that decide a shortfall, `library-sync`
 * for what is on the server and `episode-reconcile` for what the calendar says
 * is late: once both have run since the decision, they have had their chance to
 * contradict it and reality takes over again, whichever way it goes. Nothing has
 * to be undone, and an administrator who closed an ask too early is corrected by
 * the next cycle rather than believed forever.
 */

/**
 * The moment the index and the server were last in agreement.
 *
 * The earlier of the two passes, never the later: a decision taken between them
 * has only been checked by one, and one is not enough to settle a series whose
 * shortfall the other one holds. A pass that has never succeeded reads as the
 * epoch, so a fresh install trusts the administration rather than a scan that
 * never happened.
 */
const LAST_SCAN = sql`least(
  coalesce((SELECT last_success_at FROM job_state WHERE job_name = 'library-sync'), to_timestamp(0)),
  coalesce((SELECT last_success_at FROM job_state WHERE job_name = 'episode-reconcile'), to_timestamp(0))
)`;

/** Asks the administration has just answered, seen from one title. */
export async function settledAsksFor(
  kind: MediaKind,
  providerId: string,
): Promise<SettledAsks> {
  const rows = await db()
    .select({ seasonNumber: reports.seasonNumber })
    .from(reports)
    .innerJoin(media, eq(media.id, reports.mediaId))
    .where(
      and(
        eq(media.providerId, providerId),
        eq(media.mediaType, kind),
        inArray(reports.reason, [...ASK_REASONS]),
        // A season is what the page can mark, so an ask pointing at one single
        // episode settles nothing a badge could show.
        isNull(reports.episodeNumber),
        eq(reports.status, "resolved"),
        gt(reports.closedAt, LAST_SCAN),
      ),
    );

  if (rows.length === 0) return NOTHING_SETTLED;

  return {
    series: rows.some((row) => row.seasonNumber === null),
    seasons: [
      ...new Set(
        rows
          .map((row) => row.seasonNumber)
          .filter(
            (seasonNumber): seasonNumber is number => seasonNumber !== null,
          ),
      ),
    ],
  };
}

/**
 * Titles a search may stop calling partial, by `kind:providerId`.
 *
 * Coarser than the title page on purpose: a search result is one word, so it
 * only stops saying "partly here" when nothing is still being asked for. One
 * ask answered while another is open leaves the series short, and saying
 * otherwise would promise what its own page immediately takes back.
 */
export async function settledIndex(
  providerIds: string[],
): Promise<Set<string>> {
  if (providerIds.length === 0) return new Set();

  const stillAsked = alias(reports, "still_asked");
  const rows = await db()
    .selectDistinct({
      providerId: media.providerId,
      mediaType: media.mediaType,
    })
    .from(reports)
    .innerJoin(media, eq(media.id, reports.mediaId))
    .where(
      and(
        inArray(media.providerId, providerIds),
        inArray(reports.reason, [...ASK_REASONS]),
        eq(reports.status, "resolved"),
        gt(reports.closedAt, LAST_SCAN),
        notExists(
          db()
            .select({ one: sql`1` })
            .from(stillAsked)
            .where(
              and(
                eq(stillAsked.mediaId, reports.mediaId),
                inArray(stillAsked.reason, [...ASK_REASONS]),
                inArray(stillAsked.status, [...LIVE_REPORT_STATUSES]),
              ),
            ),
        ),
      ),
    );

  // Keyed by kind as well: a movie and a series can carry the same id.
  return new Set(rows.map((row) => `${row.mediaType}:${row.providerId}`));
}
