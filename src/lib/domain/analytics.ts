import "server-only";

import { and, eq, gte, inArray, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { analyticsDaily, libraryItems, mediaRequests } from "@/lib/db/schema";
import { dayKey } from "@/lib/format";

/**
 * Usage statistics.
 *
 * Daily aggregated counters only: never who searched for what, never who
 * watched what (see the privacy section of `docs/product.md`).
 */

export type Metric =
  | "searches"
  | "requests_created"
  | "reports_created"
  | "votes_cast"
  | "logins"
  | "discovery_rolls";

export async function bumpMetric(metric: Metric, delta = 1) {
  await db()
    .insert(analyticsDaily)
    .values({ day: today(), metric, count: delta })
    .onConflictDoUpdate({
      target: [analyticsDaily.day, analyticsDaily.metric],
      set: { count: sql`${analyticsDaily.count} + ${delta}` },
    });
}

export type WeeklyStats = {
  newContent: number;
  requestsHandled: number;
  newEpisodes: number;
};

/** The public "this week" summary. Aggregated, anonymous. */
export async function weeklyStats(): Promise<WeeklyStats> {
  const since = daysAgo(7);

  const [content] = await db()
    .select({ count: sql<number>`count(*)::int` })
    .from(libraryItems)
    .where(
      and(
        gte(libraryItems.addedAt, since),
        inArray(libraryItems.kind, ["movie", "show"]),
      ),
    );

  const [episodesAdded] = await db()
    .select({ count: sql<number>`count(*)::int` })
    .from(libraryItems)
    .where(
      and(gte(libraryItems.addedAt, since), eq(libraryItems.kind, "episode")),
    );

  const [handled] = await db()
    .select({ count: sql<number>`count(*)::int` })
    .from(mediaRequests)
    .where(
      and(
        gte(mediaRequests.updatedAt, since),
        eq(mediaRequests.status, "available"),
      ),
    );

  return {
    newContent: content?.count ?? 0,
    requestsHandled: handled?.count ?? 0,
    newEpisodes: episodesAdded?.count ?? 0,
  };
}

// The day where the server stands, which is the day the database counts in.
function today() {
  return dayKey();
}

function daysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}
