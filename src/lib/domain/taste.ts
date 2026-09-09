import "server-only";

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/lib/db";
import {
  accounts,
  libraryItems,
  type MediaType,
  tasteProfiles,
} from "@/lib/db/schema";
import { plexLibrary } from "@/lib/providers/plex";

/**
 * A few weighted genres per person, and nothing else.
 *
 * This is the one place in Umbra where somebody's habits leave a trace, and it
 * is shaped so that they barely can. The job reads a rolling window from the
 * media server, turns it into genre counts, and replaces the rows. No title is
 * written down, no date, no history: run it a month later and the earlier month
 * is simply gone. See `docs/adr/0007-aggregated-taste-profile.md`.
 */

/** How far back a profile looks. Anything older stops counting on its own. */
export const WINDOW_DAYS = 90;
/** A ceiling on one account's history read, so a heavy watcher cannot stall a run. */
export const HISTORY_LIMIT = 300;
/** How many genres a shelf asks for. */
export const TOP_GENRES = 3;

export type TasteWeight = {
  mediaKind: MediaType;
  genreId: number;
  weight: number;
};

/**
 * Rebuilds one account's profile.
 *
 * Every step is a replacement rather than an addition, which is what makes the
 * job idempotent and what makes the data forgettable: running it twice in a row
 * gives the same rows, and running it after a quiet month gives fewer.
 */
export async function refreshTasteProfile(account: {
  id: string;
  plexAccountId: string;
}): Promise<number> {
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const events = await plexLibrary.watchHistory({
    plexAccountId: account.plexAccountId,
    since,
    limit: HISTORY_LIMIT,
  });

  // An episode is counted against its show: the genres live on the show, and
  // ten episodes of one series should not outweigh ten different films.
  const keys = [
    ...new Set(
      events.map((event) => event.grandparentRatingKey ?? event.ratingKey),
    ),
  ];

  const weights = keys.length > 0 ? await weighKeys(keys) : [];

  await db().transaction(async (tx) => {
    await tx
      .delete(tasteProfiles)
      .where(eq(tasteProfiles.accountId, account.id));
    if (weights.length === 0) return;
    await tx.insert(tasteProfiles).values(
      weights.map((entry) => ({
        accountId: account.id,
        mediaKind: entry.mediaKind,
        genreId: entry.genreId,
        weight: entry.weight,
      })),
    );
  });

  return weights.length;
}

/**
 * Turns a set of server keys into genre counts.
 *
 * The counting happens in the database and only the totals come back, so the
 * list of what was watched never becomes a value this process holds on to.
 */
async function weighKeys(keys: string[]): Promise<TasteWeight[]> {
  const rows = await db()
    .select({
      kind: libraryItems.kind,
      genreIds: libraryItems.genreIds,
    })
    .from(libraryItems)
    .where(
      and(
        inArray(libraryItems.ratingKey, keys),
        inArray(libraryItems.kind, ["movie", "show"]),
      ),
    );

  const totals = new Map<string, TasteWeight>();
  for (const row of rows) {
    const mediaKind: MediaType = row.kind === "movie" ? "movie" : "tv";
    for (const genreId of row.genreIds ?? []) {
      const key = `${mediaKind}:${genreId}`;
      const current = totals.get(key);
      if (current) current.weight += 1;
      else totals.set(key, { mediaKind, genreId, weight: 1 });
    }
  }

  return [...totals.values()].sort((a, b) => b.weight - a.weight).slice(0, 24);
}

/** Every account the profile job has something to do for. */
export async function accountsForTaste(): Promise<
  { id: string; plexAccountId: string }[]
> {
  return db()
    .select({ id: accounts.id, plexAccountId: accounts.plexAccountId })
    .from(accounts)
    .where(eq(accounts.status, "approved"));
}

/**
 * The genres one member leans towards, strongest first.
 *
 * Memoised per render: the shelf and the guided picker both ask, and this is
 * request-scoped deduplication rather than a cache tier.
 */
export const topGenres = cache(async function topGenres(
  accountId: string,
  mediaKind: MediaType,
  limit = TOP_GENRES,
): Promise<number[]> {
  const rows = await db()
    .select({ genreId: tasteProfiles.genreId })
    .from(tasteProfiles)
    .where(
      and(
        eq(tasteProfiles.accountId, accountId),
        eq(tasteProfiles.mediaKind, mediaKind),
      ),
    )
    .orderBy(desc(tasteProfiles.weight))
    .limit(limit);
  return rows.map((row) => row.genreId);
});

/** Whether an account has enough of a profile for a shelf to be worth showing. */
export async function hasTasteProfile(accountId: string): Promise<boolean> {
  const [row] = await db()
    .select({ count: sql<number>`count(*)::int` })
    .from(tasteProfiles)
    .where(eq(tasteProfiles.accountId, accountId))
    .limit(1);
  return (row?.count ?? 0) > 0;
}

/* ------------------------------------------------------- followed shows -- */

/** How far back the home page looks to know which shows a member is on. */
export const FOLLOWED_WINDOW_DAYS = 45;
/** A ceiling on that read: the page needs a handful of shows, not a history. */
export const FOLLOWED_HISTORY_LIMIT = 120;

/**
 * The shows a member is currently watching, as server keys.
 *
 * Same contract as the profile above, and for the same reason: the history is
 * read live, lives for the length of one render, and is never written down.
 *
 * A server that does not answer costs the personalisation, not the page.
 */
export const followedSeriesKeys = cache(async function followedSeriesKeys(
  accountId: string,
): Promise<string[]> {
  const [account] = await db()
    .select({ plexAccountId: accounts.plexAccountId })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1);
  if (!account) return [];

  const since = new Date(
    Date.now() - FOLLOWED_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );

  try {
    const events = await plexLibrary.watchHistory({
      plexAccountId: account.plexAccountId,
      since,
      limit: FOLLOWED_HISTORY_LIMIT,
    });
    return [
      ...new Set(
        events
          .filter((event) => event.kind === "episode")
          .map((event) => event.grandparentRatingKey)
          .filter((key): key is string => key !== null),
      ),
    ];
  } catch (error) {
    console.warn("[taste] watch history unavailable", error);
    return [];
  }
});
