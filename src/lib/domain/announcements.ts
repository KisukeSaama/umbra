import "server-only";

import { desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  announcements,
  polls,
  type AnnouncementCategory,
  type EmbedRatio,
} from "@/lib/db/schema";
import {
  notifyAllAccounts,
  retitleNotifications,
  withdrawNotifications,
} from "@/lib/domain/notifications";
import {
  attachPoll,
  pollView,
  setPollActive,
  type PollView,
} from "@/lib/domain/polls";
import { reactionTallies } from "@/lib/domain/reactions";
import { NotFoundError } from "@/lib/errors";
import { EMPTY_TALLY, type ReactionTally } from "@/lib/reactions";

/**
 * Announcements.
 *
 * The administrator writes, the community reads. No comments: the most a
 * member says back is a thumb up or down, a choice from two that needs no
 * moderation. Members see the counts; who liked is for the staff alone, and who
 * disliked is known to no one (see `domain/reactions`).
 *
 * A poll is an announcement too, so it is not a second object with a second
 * page: it is a question hanging off a note, and the note is what carries it
 * into the feed and into the bell.
 *
 * Announcements are editorial, never a monitoring channel.
 */

/** An outward address the note exists to point at, never a payment form. */
export type AnnouncementLink = { url: string; label: string | null };

/** A page set inside the note, loaded by the reader's browser from its host. */
export type AnnouncementEmbed = {
  url: string;
  title: string | null;
  ratio: EmbedRatio;
};

type EmbedInput = { url: string; title?: string | null; ratio: EmbedRatio };

export type AnnouncementView = {
  id: string;
  title: string;
  content: string;
  category: AnnouncementCategory;
  publishedAt: Date | null;
  link: AnnouncementLink | null;
  embed: AnnouncementEmbed | null;
  poll: PollView | null;
  reactions: ReactionTally;
};

const listedColumns = {
  id: announcements.id,
  title: announcements.title,
  content: announcements.content,
  category: announcements.category,
  publishedAt: announcements.publishedAt,
  linkUrl: announcements.linkUrl,
  linkLabel: announcements.linkLabel,
  embedUrl: announcements.embedUrl,
  embedTitle: announcements.embedTitle,
  embedRatio: announcements.embedRatio,
};

/** The three embed columns, written together or cleared together. */
function embedColumns(embed: EmbedInput | null | undefined) {
  return {
    embedUrl: embed?.url.trim() ?? null,
    embedTitle: embed?.title?.trim() || null,
    embedRatio: embed ? embed.ratio : null,
  };
}

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
    embedUrl: string | null;
    embedTitle: string | null;
    embedRatio: EmbedRatio | null;
  }[],
  accountId?: string,
): Promise<AnnouncementView[]> {
  if (rows.length === 0) return [];

  const ids = rows.map((row) => row.id);
  const [attached, tallies] = await Promise.all([
    db()
      .select({ id: polls.id, announcementId: polls.announcementId })
      .from(polls)
      .where(inArray(polls.announcementId, ids)),
    reactionTallies(ids, accountId),
  ]);

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
    embed: row.embedUrl
      ? {
          url: row.embedUrl,
          title: row.embedTitle,
          ratio: row.embedRatio ?? "wide",
        }
      : null,
    poll: views.get(row.id) ?? null,
    reactions: tallies.get(row.id) ?? EMPTY_TALLY,
  }));
}

/** Everything the administration edits, drafts included. */
export async function listAllAnnouncements(
  /** The slice to read, when the caller pages. Everything, when it does not. */
  window?: { limit: number; offset: number },
): Promise<(AnnouncementView & { published: boolean; createdAt: Date })[]> {
  const query = db()
    .select({
      ...listedColumns,
      published: announcements.published,
      createdAt: announcements.createdAt,
    })
    .from(announcements)
    .orderBy(desc(announcements.createdAt));

  const rows = await (window
    ? query.limit(window.limit).offset(window.offset)
    : query);

  const views = await withPolls(rows);
  return views.map((view, index) => ({
    ...view,
    published: rows[index].published,
    createdAt: rows[index].createdAt,
  }));
}

/** How many notes there are, drafts included, for the pager above them. */
export async function countAllAnnouncements(): Promise<number> {
  const [row] = await db()
    .select({ count: sql<number>`count(*)::int` })
    .from(announcements);
  return row?.count ?? 0;
}

export type AnnouncementInput = {
  title: string;
  content: string;
  category: AnnouncementCategory;
  published: boolean;
  link?: { url: string; label?: string | null } | null;
  embed?: EmbedInput | null;
  poll?: { question: string; options: string[]; endsAt?: Date | null } | null;
};

export async function createAnnouncement(input: AnnouncementInput) {
  /*
   * The note and the question it carries are written together.
   *
   * A poll is an announcement asking something (see ADR 0011), so half of one
   * is nothing at all: a published note whose question never made it would say
   * "vote below" above an empty space, and nothing in the administration knows
   * how to finish it afterwards.
   */
  const row = await db().transaction(async (tx) => {
    const [created] = await tx
      .insert(announcements)
      .values({
        title: input.title.trim(),
        content: input.content.trim(),
        category: input.category,
        published: input.published,
        publishedAt: input.published ? new Date() : null,
        linkUrl: input.link?.url.trim() ?? null,
        linkLabel: input.link?.label?.trim() || null,
        ...embedColumns(input.embed),
      })
      .returning({ id: announcements.id });

    // A poll opens with the note that carries it: an unpublished draft asks
    // nobody anything.
    if (input.poll)
      await attachPoll(
        {
          announcementId: created.id,
          question: input.poll.question,
          options: input.poll.options,
          endsAt: input.poll.endsAt ?? null,
          active: input.published,
        },
        tx,
      );

    return created;
  });

  // Outside the transaction: the bell is a consequence of the note existing,
  // and a fan-out over every account has no business holding one open.
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
    embed: EmbedInput | null;
  }>,
) {
  const [existing] = await db()
    .select({
      title: announcements.title,
      category: announcements.category,
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

  const { link, embed, ...columns } = input;
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
      ...(embed === undefined ? {} : embedColumns(embed)),
      publishedAt,
      updatedAt: new Date(),
    })
    .where(eq(announcements.id, id))
    .returning({ id: announcements.id });

  const [poll] = await db()
    .select({ id: polls.id })
    .from(polls)
    .where(eq(polls.announcementId, id))
    .limit(1);

  const firstPublish = Boolean(input.published) && !existing.published;
  const withdrawn = input.published === false && existing.published;

  if (firstPublish) {
    // The question opens with the note, so publishing a draft that carries one
    // opens it rather than leaving a poll nobody can answer.
    if (poll) await setPollActive(poll.id, true, { notify: false });

    /*
     * What the bell carries is what the note says, and this call is the one
     * place that used not to read it. Publishing a draft is a body of
     * `{ published: true }` and nothing else, so the fan-out went out with an
     * empty title and the category of a note nobody wrote.
     */
    await announceToEveryone(
      id,
      input.title ?? existing.title,
      input.category ?? existing.category,
    );
  }

  /*
   * A note taken back takes its question with it.
   *
   * The poll is the note asking something, so leaving it open behind a note
   * that is no longer there left a question on the home page with nothing to
   * explain it, still collecting answers. Nothing is announced: a withdrawal
   * is not news.
   */
  if (withdrawn && poll) await setPollActive(poll.id, false, { notify: false });

  /*
   * An edit is not news: nothing is announced again and nothing says the note
   * changed. The one thing kept in step is the title the bell already carries,
   * so an entry does not name a note by words it no longer has.
   */
  const title = input.title?.trim();
  if (!firstPublish && title && title !== existing.title)
    await retitleNotifications("announcement", id, title);

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
  return notifyAllAccounts({
    kind: "announcement",
    subjectId: id,
    step: "published",
    payload: { title, category },
  });
}

/**
 * Deleting a note takes back what the bell said about it.
 *
 * The note's entry and its question's both point at `/news#id`, which after
 * this is nowhere. The poll goes by cascade, so its id is read first.
 */
export async function deleteAnnouncement(id: string) {
  const attached = await db()
    .select({ id: polls.id })
    .from(polls)
    .where(eq(polls.announcementId, id));

  const [row] = await db()
    .delete(announcements)
    .where(eq(announcements.id, id))
    .returning({ id: announcements.id });
  if (!row) throw new NotFoundError("error.announcementNotFound");

  await withdrawNotifications(["announcement"], [id]);
  await withdrawNotifications(
    ["poll_open"],
    attached.map((poll) => poll.id),
  );
  return row;
}
