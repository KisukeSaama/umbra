import "server-only";

import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";

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
  | "discovery_rolls"
  /**
   * How many people the media server is shared with, as the membership sweep
   * last counted them. A gauge rather than a counter: it is set, never added
   * to, and it is an aggregate like every other row here.
   */
  | "server_members";

export async function bumpMetric(metric: Metric, delta = 1) {
  await db()
    .insert(analyticsDaily)
    .values({ day: today(), metric, count: delta })
    .onConflictDoUpdate({
      target: [analyticsDaily.day, analyticsDaily.metric],
      set: { count: sql`${analyticsDaily.count} + ${delta}` },
    });
}

/** Writes a gauge: today's value replaces today's value. */
export async function setMetric(metric: Metric, value: number) {
  await db()
    .insert(analyticsDaily)
    .values({ day: today(), metric, count: value })
    .onConflictDoUpdate({
      target: [analyticsDaily.day, analyticsDaily.metric],
      set: { count: value },
    });
}

/** The most recent value of a gauge, or `null` if it was never written. */
export async function latestMetric(metric: Metric): Promise<number | null> {
  const [row] = await db()
    .select({ count: analyticsDaily.count })
    .from(analyticsDaily)
    .where(eq(analyticsDaily.metric, metric))
    .orderBy(desc(analyticsDaily.day))
    .limit(1);
  return row?.count ?? null;
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
