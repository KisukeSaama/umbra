import "server-only";

import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  analyticsDaily,
  episodes,
  libraryItems,
  mediaRequests,
} from "@/lib/db/schema";

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

export type UsageSeries = { metric: string; day: string; count: number }[];

/** Raw time series, admin only. */
export async function usageOverDays(days = 30): Promise<UsageSeries> {
  const since = daysAgo(days).toISOString().slice(0, 10);
  return db()
    .select({
      metric: analyticsDaily.metric,
      day: analyticsDaily.day,
      count: analyticsDaily.count,
    })
    .from(analyticsDaily)
    .where(gte(analyticsDaily.day, since))
    .orderBy(desc(analyticsDaily.day));
}

/** Tracked episodes whose broadcast has passed and that are still missing. */
export async function missingEpisodeCount(): Promise<number> {
  const [row] = await db()
    .select({ count: sql<number>`count(*)::int` })
    .from(episodes)
    .where(eq(episodes.status, "aired_missing"));
  return row?.count ?? 0;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}
