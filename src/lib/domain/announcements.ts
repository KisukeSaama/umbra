import "server-only";

import { and, desc, eq, inArray, ne, sql, type SQL } from "drizzle-orm";
import { cache } from "react";

import { uploadUrl } from "@/lib/announcements";
import { db, type Queryable } from "@/lib/db";
import { isUniqueViolation } from "@/lib/db/errors";
import {
  accounts,
  announcements,
  polls,
  type AnnouncementCategory,
  type EmbedRatio,
} from "@/lib/db/schema";
import { countAccounts } from "@/lib/domain/accounts";
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
import { describeUpload } from "@/lib/domain/uploads";
import { BadRequestError, ConflictError, NotFoundError } from "@/lib/errors";
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

/**
 * The note's visual: a file Umbra re-encoded and keeps itself, its size, and
 * the words the staff gave for whoever cannot see it.
 */
export type AnnouncementImage = {
  key: string;
  url: string;
  width: number;
  height: number;
  alt: string;
};

type ImageInput = { key: string; alt: string };

/** A pin to the home page, until a date or until it is taken off. */
type FeatureInput = { until: Date | null };

export type AnnouncementView = {
  id: string;
  title: string;
  content: string;
  category: AnnouncementCategory;
  publishedAt: Date | null;
  link: AnnouncementLink | null;
  embed: AnnouncementEmbed | null;
  image: AnnouncementImage | null;
  /** Pinned to the home page; whether the pin still shows depends on `featuredUntil`. */
  featured: boolean;
  featuredUntil: Date | null;
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
  imageKey: announcements.imageKey,
  imageWidth: announcements.imageWidth,
  imageHeight: announcements.imageHeight,
  imageAlt: announcements.imageAlt,
  featured: announcements.featured,
  featuredUntil: announcements.featuredUntil,
};

type ListedRow = {
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
  imageKey: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
  imageAlt: string | null;
  featured: boolean;
  featuredUntil: Date | null;
};

/**
 * The four visual columns, written together or cleared together.
 *
 * The size is read from the stored file rather than taken from the request,
 * and a key that names no file is refused: a note pointing at a picture that
 * is not there would reserve its space in the feed and show nothing in it.
 */
async function imageColumns(image: ImageInput | null) {
  if (!image)
    return {
      imageKey: null,
      imageWidth: null,
      imageHeight: null,
      imageAlt: null,
    };
  const size = await describeUpload(image.key);
  if (!size) throw new BadRequestError("error.imageMissing");
  return {
    imageKey: image.key,
    imageWidth: size.width,
    imageHeight: size.height,
    imageAlt: image.alt.trim(),
  };
}

/**
 * A fundraiser is a note that points at its page, so it never goes out
 * without the address (see `docs/adr/0010-no-funding-goal.md`). Asked of the
 * note as it will be once written, since an edit may change either half.
 */
function assertFundingLink(
  category: AnnouncementCategory,
  linkUrl: string | null,
) {
  if (category === "funding" && !linkUrl)
    throw new BadRequestError("error.fundingNeedsLink");
}

/**
 * Takes the pin off every other note and puts it on this one.
 *
 * Two statements, so two staff pinning at the same moment could both commit
 * without `announcement_single_featured_idx`; with it, the second is refused
 * and reported as a conflict rather than as a fault.
 */
async function pin(tx: Queryable, id: string, until: Date | null) {
  await tx
    .update(announcements)
    .set({ featured: false, featuredUntil: null })
    .where(and(eq(announcements.featured, true), ne(announcements.id, id)));
  await tx
    .update(announcements)
    .set({ featured: true, featuredUntil: until })
    .where(eq(announcements.id, id));
}

function featureConflict(error: unknown): never {
  if (isUniqueViolation(error)) throw new ConflictError("error.featureTaken");
  throw error;
}

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
  /** A note to leave out, the one the home page already leads with. */
  except?: string,
): Promise<AnnouncementView[]> {
  const rows = await db()
    .select(listedColumns)
    .from(announcements)
    .where(
      and(
        eq(announcements.published, true),
        except ? ne(announcements.id, except) : undefined,
      ),
    )
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
  except?: string,
): Promise<AnnouncementView | null> {
  const [row] = await publishedAnnouncements(1, accountId, 0, except);
  return row ?? null;
}

/**
 * What the database asks of a pin before the home page shows it, the same
 * three things `isFeaturedNow` asks in `@/lib/announcements`: pinned,
 * published, and not past its date. Compared with now on every read, so a
 * pin that ran out during downtime is already gone when Umbra comes back.
 */
const FEATURED_NOW: SQL = sql`${announcements.featured}
  AND ${announcements.published}
  AND (${announcements.featuredUntil} IS NULL OR ${announcements.featuredUntil} > now())`;

/** The note the home page leads with, or `null` when none is pinned now. */
export async function featuredAnnouncement(
  accountId?: string,
): Promise<AnnouncementView | null> {
  const rows = await db()
    .select(listedColumns)
    .from(announcements)
    .where(FEATURED_NOW)
    .limit(1);
  const [view] = await withPolls(rows, accountId);
  return view ?? null;
}

/**
 * Whether a note went out since this member last had the news page in front
 * of them. A member who never opened it has everything to read.
 *
 * Memoised for the render, since the header and the tab bar both ask.
 */
export const hasUnreadNews = cache(
  async (accountId: string): Promise<boolean> => {
    const [row] = await db().execute<{ unread: boolean }>(sql`
      SELECT EXISTS (
        SELECT 1 FROM announcement
         WHERE published
           AND published_at > coalesce(
                 (SELECT news_seen_at FROM account WHERE id = ${accountId}::uuid),
                 '-infinity'::timestamptz)
      ) AS unread
    `);
    return Boolean(row?.unread);
  },
);

/**
 * Records that this member saw the feed up to the note published at `through`.
 *
 * The date is the newest one the page showed them rather than the moment of
 * the call, so a note published in between still counts as unread. It only
 * ever moves forward, and never past now: a member can only tell Umbra about
 * their own reading, and only about notes that exist.
 */
export async function markNewsSeen(accountId: string, through: Date) {
  await db()
    .update(accounts)
    .set({
      newsSeenAt: sql`GREATEST(
        coalesce(${accounts.newsSeenAt}, '-infinity'::timestamptz),
        LEAST(${through.toISOString()}::timestamptz, now()))`,
    })
    .where(eq(accounts.id, accountId));
}

/**
 * Fills in the questions.
 *
 * One query finds every poll of the page and one counts who could answer, so
 * the cost follows the questions rather than the notes: each poll then takes
 * two or three reads of its own (`pollView`: the poll, its tally in a single
 * snapshot, and the reader's vote when there is a reader). A feed of thirty
 * notes without a question costs two round trips.
 */
async function withPolls(
  rows: ListedRow[],
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

  // How many people could answer is the same number for every question on the
  // page, and it is a count over the whole of `account`: asked once, not once
  // per note.
  const members = attached.length > 0 ? await countAccounts() : 0;

  const views = new Map<string, PollView>();
  await Promise.all(
    attached.map(async (poll) => {
      views.set(
        poll.announcementId,
        await pollView(poll.id, accountId, members),
      );
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
    image:
      row.imageKey && row.imageWidth && row.imageHeight && row.imageAlt
        ? {
            key: row.imageKey,
            url: uploadUrl(row.imageKey),
            width: row.imageWidth,
            height: row.imageHeight,
            alt: row.imageAlt,
          }
        : null,
    featured: row.featured,
    featuredUntil: row.featuredUntil,
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
  image?: ImageInput | null;
  featured?: FeatureInput | null;
  poll?: { question: string; options: string[]; endsAt?: Date | null } | null;
};

export async function createAnnouncement(input: AnnouncementInput) {
  const linkUrl = input.link?.url.trim() || null;
  assertFundingLink(input.category, linkUrl);
  // A draft is shown to nobody, so it cannot lead the home page; the database
  // says so too (`announcement_featured_published_check`).
  if (input.featured && !input.published)
    throw new BadRequestError("error.featureNeedsPublish");
  const image = await imageColumns(input.image ?? null);

  /*
   * The note and the question it carries are written together.
   *
   * A poll is an announcement asking something (see ADR 0011), so half of one
   * is nothing at all: a published note whose question never made it would say
   * "vote below" above an empty space, and nothing in the administration knows
   * how to finish it afterwards.
   */
  const row = await db()
    .transaction(async (tx) => {
      const [created] = await tx
        .insert(announcements)
        .values({
          title: input.title.trim(),
          content: input.content.trim(),
          category: input.category,
          published: input.published,
          publishedAt: input.published ? new Date() : null,
          linkUrl,
          linkLabel: input.link?.label?.trim() || null,
          ...embedColumns(input.embed),
          ...image,
        })
        .returning({ id: announcements.id });

      if (input.featured) await pin(tx, created.id, input.featured.until);

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
    })
    .catch(featureConflict);

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
    image: ImageInput | null;
    featured: FeatureInput | null;
  }>,
) {
  const [existing] = await db()
    .select({
      title: announcements.title,
      category: announcements.category,
      published: announcements.published,
      publishedAt: announcements.publishedAt,
      linkUrl: announcements.linkUrl,
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

  const { link, embed, image, featured, ...columns } = input;
  const linkUrl =
    link === undefined ? existing.linkUrl : link?.url.trim() || null;
  assertFundingLink(input.category ?? existing.category, linkUrl);

  const published = input.published ?? existing.published;
  if (featured && !published)
    throw new BadRequestError("error.featureNeedsPublish");

  const row = await db()
    .transaction(async (tx) => {
      const [updated] = await tx
        .update(announcements)
        .set({
          ...columns,
          ...(link === undefined
            ? {}
            : { linkUrl, linkLabel: link?.label?.trim() || null }),
          ...(embed === undefined ? {} : embedColumns(embed)),
          ...(image === undefined ? {} : await imageColumns(image)),
          // A note taken back takes its pin with it, in the same statement:
          // the database refuses a pinned draft.
          ...(featured === null || !published
            ? { featured: false, featuredUntil: null }
            : {}),
          publishedAt,
          updatedAt: new Date(),
        })
        .where(eq(announcements.id, id))
        .returning({ id: announcements.id });
      if (featured) await pin(tx, id, featured.until);
      return updated;
    })
    .catch(featureConflict);

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
 * Everyone with an account hears about a new note: holding one already means
 * the server is shared with them (see `docs/adr/0014-only-members-of-the-server.md`).
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
