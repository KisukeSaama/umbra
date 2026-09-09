import "server-only";

import { desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  announcements,
  polls,
  type AnnouncementCategory,
} from "@/lib/db/schema";
import { notifyApprovedAccounts } from "@/lib/domain/notifications";
import {
  attachPoll,
  pollView,
  setPollActive,
  type PollView,
} from "@/lib/domain/polls";
import { NotFoundError } from "@/lib/errors";

/**
 * Announcements.
 *
 * The administrator writes, the community reads. No comments, no reactions:
 * the one-way street is the feature.
 *
 * A poll is an announcement too, so it is not a second object with a second
 * page: it is a question hanging off a note, and the note is what carries it
 * into the feed and into the bell.
 *
 * Announcements are editorial, never a monitoring channel.
 */

/** An outward address the note exists to point at, never a payment form. */
export type AnnouncementLink = { url: string; label: string | null };

export type AnnouncementView = {
  id: string;
  title: string;
  content: string;
  category: AnnouncementCategory;
  publishedAt: Date | null;
  link: AnnouncementLink | null;
  poll: PollView | null;
};

const listedColumns = {
  id: announcements.id,
  title: announcements.title,
  content: announcements.content,
  category: announcements.category,
  publishedAt: announcements.publishedAt,
  linkUrl: announcements.linkUrl,
  linkLabel: announcements.linkLabel,
};

export async function publishedAnnouncements(
  limit = 20,
  accountId?: string,
  offset = 0,
): Promise<AnnouncementView[]> {
  const rows = await db()
    .select(listedColumns)
    .from(announcements)
    .where(eq(announcements.published, true))
    .orderBy(desc(announcements.publishedAt))
    .limit(limit)
    .offset(offset);

  return withPolls(rows, accountId);
}

/** How many notes the feed holds, so a page knows where it ends. */
export async function countPublishedAnnouncements(): Promise<number> {
  const [row] = await db()
    .select({ count: sql<number>`count(*)::int` })
    .from(announcements)
    .where(eq(announcements.published, true));
  return row?.count ?? 0;
}

export async function latestAnnouncement(
  accountId?: string,
): Promise<AnnouncementView | null> {
  const [row] = await publishedAnnouncements(1, accountId);
  return row ?? null;
}

/**
 * Fills in the questions.
 *
 * One query finds every poll of the page, so a feed of thirty notes costs two
 * round trips plus one tally per poll rather than one per note.
 */
async function withPolls(
  rows: {
    id: string;
    title: string;
    content: string;
    category: AnnouncementCategory;
    publishedAt: Date | null;
    linkUrl: string | null;
    linkLabel: string | null;
  }[],
  accountId?: string,
): Promise<AnnouncementView[]> {
  if (rows.length === 0) return [];

  const attached = await db()
    .select({ id: polls.id, announcementId: polls.announcementId })
    .from(polls)
    .where(
      inArray(
        polls.announcementId,
        rows.map((row) => row.id),
      ),
    );

  const views = new Map<string, PollView>();
  await Promise.all(
    attached.map(async (poll) => {
      views.set(poll.announcementId, await pollView(poll.id, accountId));
    }),
  );

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    content: row.content,
    category: row.category,
    publishedAt: row.publishedAt,
    link: row.linkUrl ? { url: row.linkUrl, label: row.linkLabel } : null,
    poll: views.get(row.id) ?? null,
  }));
}

/** Everything the administration edits, drafts included. */
export async function listAllAnnouncements(): Promise<
  (AnnouncementView & { published: boolean; createdAt: Date })[]
> {
  const rows = await db()
    .select({
      ...listedColumns,
      published: announcements.published,
      createdAt: announcements.createdAt,
    })
    .from(announcements)
    .orderBy(desc(announcements.createdAt));

  const views = await withPolls(rows);
  return views.map((view, index) => ({
    ...view,
    published: rows[index].published,
    createdAt: rows[index].createdAt,
  }));
}

export type AnnouncementInput = {
  title: string;
  content: string;
  category: AnnouncementCategory;
  published: boolean;
  link?: { url: string; label?: string | null } | null;
  poll?: { question: string; options: string[]; endsAt?: Date | null } | null;
};

export async function createAnnouncement(input: AnnouncementInput) {
  const [row] = await db()
    .insert(announcements)
    .values({
      title: input.title.trim(),
      content: input.content.trim(),
      category: input.category,
      published: input.published,
      publishedAt: input.published ? new Date() : null,
      linkUrl: input.link?.url.trim() ?? null,
      linkLabel: input.link?.label?.trim() || null,
    })
    .returning({ id: announcements.id });

  // A poll opens with the note that carries it: an unpublished draft asks
  // nobody anything.
  if (input.poll)
    await attachPoll({
      announcementId: row.id,
      question: input.poll.question,
      options: input.poll.options,
      endsAt: input.poll.endsAt ?? null,
      active: input.published,
    });

  if (input.published)
    await announceToEveryone(row.id, input.title, input.category);
  return row;
}

export async function updateAnnouncement(
  id: string,
  input: Partial<{
    title: string;
    content: string;
    category: AnnouncementCategory;
    published: boolean;
    link: { url: string; label?: string | null } | null;
  }>,
) {
  const [existing] = await db()
    .select({
      published: announcements.published,
      publishedAt: announcements.publishedAt,
    })
    .from(announcements)
    .where(eq(announcements.id, id))
    .limit(1);
  if (!existing) throw new NotFoundError("error.announcementNotFound");

  // The publication date is set on the first publish and kept afterwards.
  const publishedAt =
    input.published && !existing.publishedAt
      ? new Date()
      : (existing.publishedAt ?? null);

  const { link, ...columns } = input;
  const [row] = await db()
    .update(announcements)
    .set({
      ...columns,
      ...(link === undefined
        ? {}
        : {
            linkUrl: link?.url.trim() ?? null,
            linkLabel: link?.label?.trim() || null,
          }),
      publishedAt,
      updatedAt: new Date(),
    })
    .where(eq(announcements.id, id))
    .returning({ id: announcements.id });

  const firstPublish = Boolean(input.published) && !existing.published;
  if (firstPublish) {
    // The question opens with the note, so publishing a draft that carries one
    // opens it rather than leaving a poll nobody can answer.
    const [poll] = await db()
      .select({ id: polls.id })
      .from(polls)
      .where(eq(polls.announcementId, id))
      .limit(1);
    if (poll) await setPollActive(poll.id, true, { notify: false });

    await announceToEveryone(
      id,
      input.title ?? "",
      input.category ?? "information",
    );
  }
  return row;
}

/**
 * Everyone approved hears about a new note.
 *
 * The entry carries the title and the category, never the body: the body can be
 * long, it can be edited, and the bell is a pointer rather than a copy.
 */
async function announceToEveryone(
  id: string,
  title: string,
  category: AnnouncementCategory,
) {
  return notifyApprovedAccounts({
    kind: "announcement",
    subjectId: id,
    step: "published",
    payload: { title, category },
  });
}

export async function deleteAnnouncement(id: string) {
  const [row] = await db()
    .delete(announcements)
    .where(eq(announcements.id, id))
    .returning({ id: announcements.id });
  if (!row) throw new NotFoundError("error.announcementNotFound");
  return row;
}
