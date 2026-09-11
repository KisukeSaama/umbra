import "server-only";

import { and, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/lib/db";
import {
  notifications,
  type NotificationKind,
  type NotificationPayload,
} from "@/lib/db/schema";
import { publishNotified } from "@/lib/realtime";

/**
 * What a member is told.
 *
 * Nothing here is a sentence. An entry carries a kind, the subject it is about
 * and a little structured data, and the client turns that into words in its own
 * language, exactly like an API error carries a `messageKey`. That is also what
 * makes the whole thing translatable after the fact.
 */

export type NotificationEntry = {
  kind: NotificationKind;
  subjectId: string | null;
  /** What distinguishes this announcement from the next one about the subject. */
  step: string;
  payload: NotificationPayload;
};

export type NotificationRow = {
  id: string;
  kind: NotificationKind;
  subjectId: string | null;
  payload: NotificationPayload;
  createdAt: Date;
  read: boolean;
};

/**
 * The key that makes a fan-out repeatable.
 *
 * The step is part of it on purpose. Keyed on the subject alone, a request
 * moving from accepted to available would announce the first and swallow the
 * second, which is the one the member actually waited for. The cost is that an
 * administrator undoing and redoing a step says nothing the second time, which
 * is the right way round.
 */
export function dedupKeyFor(entry: NotificationEntry): string {
  return `${entry.kind}:${entry.subjectId ?? "none"}:${entry.step}`;
}

/** Tells a known set of people. Repeating the call adds nothing. */
export async function notify(
  accountIds: string[],
  entry: NotificationEntry,
): Promise<number> {
  const unique = [...new Set(accountIds)];
  if (unique.length === 0) return 0;

  const dedupKey = dedupKeyFor(entry);
  const inserted = await db()
    .insert(notifications)
    .values(
      unique.map((accountId) => ({
        accountId,
        kind: entry.kind,
        subjectId: entry.subjectId,
        dedupKey,
        payload: entry.payload,
      })),
    )
    .onConflictDoNothing({
      target: [notifications.accountId, notifications.dedupKey],
    })
    .returning({
      id: notifications.id,
      accountId: notifications.accountId,
    });

  // Only what was actually inserted: a replayed job must stay silent on the
  // wire exactly as it stays silent in the table.
  await publishNotified(inserted.map((row) => row.accountId));

  return inserted.length;
}

/**
 * Tells everyone who has an account.
 *
 * One statement rather than a loop: the set is small, but a loop would be a
 * read-then-write and would stop being idempotent the moment it failed halfway.
 * Every parameter is cast, because the driver sends them untyped and Postgres
 * cannot guess a type for a bare parameter in a select list.
 */
export async function notifyAllAccounts(
  entry: NotificationEntry,
): Promise<number> {
  const rows = await db().execute<{ account_id: string }>(sql`
    INSERT INTO notification (account_id, kind, subject_id, dedup_key, payload)
    SELECT a.id,
           ${entry.kind}::text,
           ${entry.subjectId}::uuid,
           ${dedupKeyFor(entry)}::text,
           ${JSON.stringify(entry.payload)}::jsonb
      FROM account AS a
    ON CONFLICT (account_id, dedup_key) DO NOTHING
    RETURNING account_id
  `);

  // `RETURNING` names the rows the conflict clause let through, which is both
  // the count and the set to nudge.
  const accountIds = [...rows].map((row) => row.account_id);
  await publishNotified(accountIds);
  return accountIds.length;
}

/**
 * Takes back what was said about subjects that no longer exist.
 *
 * An entry is a pointer, and a pointer to a deleted note lands on nothing, so
 * the entries go with the note, read or not. The accounts that lost an unread
 * one are nudged, or their bell would keep counting it until the next page.
 */
export async function withdrawNotifications(
  kinds: NotificationKind[],
  subjectIds: string[],
): Promise<number> {
  if (kinds.length === 0 || subjectIds.length === 0) return 0;

  const removed = await db()
    .delete(notifications)
    .where(
      and(
        inArray(notifications.kind, kinds),
        inArray(notifications.subjectId, subjectIds),
      ),
    )
    .returning({
      accountId: notifications.accountId,
      readAt: notifications.readAt,
    });

  await publishNotified(
    removed.filter((row) => row.readAt === null).map((row) => row.accountId),
  );
  return removed.length;
}

/**
 * Keeps the title an entry carries in step with the subject it points at.
 *
 * Silent on purpose: nothing is marked unread again and nobody is nudged,
 * since a corrected title is not news.
 */
export async function retitleNotifications(
  kind: NotificationKind,
  subjectId: string,
  title: string,
): Promise<void> {
  await db()
    .update(notifications)
    .set({
      payload: sql`jsonb_set(${notifications.payload}, '{title}', ${JSON.stringify(title)}::jsonb)`,
    })
    .where(
      and(eq(notifications.kind, kind), eq(notifications.subjectId, subjectId)),
    );
}

export async function listNotifications(
  accountId: string,
  limit = 30,
  /**
   * Only what landed after this instant, for a live stream catching up on the
   * entries it was nudged about. Rows come back newest first either way, so the
   * caller advances its mark from the first one.
   */
  since?: Date,
): Promise<NotificationRow[]> {
  const rows = await db()
    .select({
      id: notifications.id,
      kind: notifications.kind,
      subjectId: notifications.subjectId,
      payload: notifications.payload,
      createdAt: notifications.createdAt,
      readAt: notifications.readAt,
    })
    .from(notifications)
    .where(
      and(
        eq(notifications.accountId, accountId),
        since ? gt(notifications.createdAt, since) : undefined,
      ),
    )
    .orderBy(desc(notifications.createdAt))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    subjectId: row.subjectId,
    payload: row.payload,
    createdAt: row.createdAt,
    read: row.readAt !== null,
  }));
}

/** How many badges the bell shows, capped so the query stays trivial. */
export const UNREAD_CAP = 9;

/**
 * The count, asked again every time.
 *
 * The live stream needs this one: it outlives the request that opened it, and a
 * memoised count would hand it the same number for as long as the member kept
 * the page open.
 */
export async function unreadNow(accountId: string): Promise<number> {
  const rows = await db()
    .select({ id: notifications.id })
    .from(notifications)
    .where(
      and(eq(notifications.accountId, accountId), isNull(notifications.readAt)),
    )
    .limit(UNREAD_CAP + 1);
  return rows.length;
}

/**
 * Memoised per render, not cached across requests: the header and the page both
 * ask for it in the same pass, and every page runs its own guard rather than
 * trusting the layout above it.
 */
export const unreadCount = cache(unreadNow);

export async function markRead(
  accountId: string,
  ids?: string[],
): Promise<number> {
  const result = await db()
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.accountId, accountId),
        isNull(notifications.readAt),
        ids?.length ? inArray(notifications.id, ids) : undefined,
      ),
    )
    .returning({ id: notifications.id });
  return result.length;
}

/**
 * Retention.
 *
 * Read entries go after a month, everything goes after six, and an unread entry
 * inside that floor is never touched: the follow-up page is what it is because
 * nothing a member has not seen yet disappears. Bounded per run so a backlog
 * drains over several passes instead of blowing one request.
 *
 * An entry about a note or a poll that no longer exists goes too, whatever its
 * age: deleting a note withdraws its entries on the spot, and this catches the
 * ones left behind by deletions made before that was the case.
 */
export async function purgeNotifications(batch = 5000): Promise<number> {
  const result = await db().execute(sql`
    DELETE FROM notification
     WHERE ctid IN (
       SELECT n.ctid FROM notification AS n
        WHERE (n.read_at IS NOT NULL AND n.read_at < now() - interval '30 days')
           OR n.created_at < now() - interval '180 days'
           OR (n.kind = 'announcement' AND n.subject_id IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM announcement AS a WHERE a.id = n.subject_id))
           OR (n.kind = 'poll_open' AND n.subject_id IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM poll AS p WHERE p.id = n.subject_id))
        LIMIT ${batch}
     )
  `);
  return result.count ?? 0;
}
