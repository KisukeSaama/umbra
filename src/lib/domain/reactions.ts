import "server-only";

import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  accounts,
  announcementReactions,
  announcements,
  type ReactionValue,
} from "@/lib/db/schema";
import { NotFoundError } from "@/lib/errors";
import { EMPTY_TALLY, type ReactionTally } from "@/lib/reactions";

/**
 * Thumbs up and down on announcements.
 *
 * Members see two numbers and nothing else: who pressed which thumb is read by
 * the staff alone, on the administration page. A reaction is a choice from two,
 * so like every other thing a member can do here it needs no moderation.
 */

/** The counts of every note given, plus what `accountId` picked on each. */
export async function reactionTallies(
  announcementIds: string[],
  accountId?: string,
): Promise<Map<string, ReactionTally>> {
  const tallies = new Map<string, ReactionTally>(
    announcementIds.map((id) => [id, EMPTY_TALLY]),
  );
  if (announcementIds.length === 0) return tallies;

  const rows = await db()
    .select({
      announcementId: announcementReactions.announcementId,
      likes: sql<number>`count(*) filter (where ${announcementReactions.value} = 'like')::int`,
      dislikes: sql<number>`count(*) filter (where ${announcementReactions.value} = 'dislike')::int`,
      own: accountId
        ? sql<ReactionValue | null>`max(case when ${announcementReactions.accountId} = ${accountId} then ${announcementReactions.value} end)`
        : sql<null>`null`,
    })
    .from(announcementReactions)
    .where(inArray(announcementReactions.announcementId, announcementIds))
    .groupBy(announcementReactions.announcementId);

  for (const row of rows)
    tallies.set(row.announcementId, {
      likes: row.likes,
      dislikes: row.dislikes,
      own: row.own ?? null,
    });
  return tallies;
}

/**
 * Sets, moves or takes back a person's reaction on a published note.
 *
 * The primary key holds one row per person and note, so this is an upsert
 * rather than a read-then-write, and two quick presses cannot leave two rows.
 */
export async function setReaction(
  announcementId: string,
  accountId: string,
  value: ReactionValue | null,
): Promise<ReactionTally> {
  const [note] = await db()
    .select({ id: announcements.id })
    .from(announcements)
    .where(
      and(
        eq(announcements.id, announcementId),
        eq(announcements.published, true),
      ),
    )
    .limit(1);
  // A draft is not there yet for members, so it cannot be reacted to either.
  if (!note) throw new NotFoundError("error.announcementNotFound");

  if (value === null)
    await db()
      .delete(announcementReactions)
      .where(
        and(
          eq(announcementReactions.announcementId, announcementId),
          eq(announcementReactions.accountId, accountId),
        ),
      );
  else
    await db()
      .insert(announcementReactions)
      .values({ announcementId, accountId, value })
      .onConflictDoUpdate({
        target: [
          announcementReactions.announcementId,
          announcementReactions.accountId,
        ],
        set: { value, createdAt: new Date() },
      });

  const tallies = await reactionTallies([announcementId], accountId);
  return tallies.get(announcementId) ?? EMPTY_TALLY;
}

export type ReactionRoster = { likes: string[]; dislikes: string[] };

/**
 * Who reacted how, for the staff only.
 *
 * Only notes someone reacted to appear in the map. Names come in the order the
 * reactions landed.
 */
export async function reactionRoster(
  announcementIds: string[],
): Promise<Map<string, ReactionRoster>> {
  const roster = new Map<string, ReactionRoster>();
  if (announcementIds.length === 0) return roster;

  const rows = await db()
    .select({
      announcementId: announcementReactions.announcementId,
      value: announcementReactions.value,
      username: accounts.username,
    })
    .from(announcementReactions)
    .innerJoin(accounts, eq(accounts.id, announcementReactions.accountId))
    .where(inArray(announcementReactions.announcementId, announcementIds))
    .orderBy(asc(announcementReactions.createdAt));

  for (const row of rows) {
    const entry = roster.get(row.announcementId) ?? { likes: [], dislikes: [] };
    (row.value === "like" ? entry.likes : entry.dislikes).push(row.username);
    roster.set(row.announcementId, entry);
  }
  return roster;
}
