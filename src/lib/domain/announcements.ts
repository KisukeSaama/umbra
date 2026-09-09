import "server-only";

import { desc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { announcements, type AnnouncementCategory } from "@/lib/db/schema";
import { notifyApprovedAccounts } from "@/lib/domain/notifications";
import { NotFoundError } from "@/lib/errors";

/**
 * Announcements.
 *
 * The administrator writes, the community reads. No comments, no reactions:
 * the one-way street is the feature.
 *
 * Announcements are editorial, never a monitoring channel.
 */

export type AnnouncementView = {
  id: string;
  title: string;
  content: string;
  category: AnnouncementCategory;
  publishedAt: Date | null;
};

export async function publishedAnnouncements(
  limit = 20,
): Promise<AnnouncementView[]> {
  return db()
    .select({
      id: announcements.id,
      title: announcements.title,
      content: announcements.content,
      category: announcements.category,
      publishedAt: announcements.publishedAt,
    })
    .from(announcements)
    .where(eq(announcements.published, true))
    .orderBy(desc(announcements.publishedAt))
    .limit(limit);
}

export async function latestAnnouncement(): Promise<AnnouncementView | null> {
  const [row] = await publishedAnnouncements(1);
  return row ?? null;
}

export async function listAllAnnouncements() {
  return db()
    .select()
    .from(announcements)
    .orderBy(desc(announcements.createdAt));
}

export async function createAnnouncement(input: {
  title: string;
  content: string;
  category: AnnouncementCategory;
  published: boolean;
}) {
  const [row] = await db()
    .insert(announcements)
    .values({
      title: input.title.trim(),
      content: input.content.trim(),
      category: input.category,
      published: input.published,
      publishedAt: input.published ? new Date() : null,
    })
    .returning({ id: announcements.id });
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

  const [row] = await db()
    .update(announcements)
    .set({ ...input, publishedAt, updatedAt: new Date() })
    .where(eq(announcements.id, id))
    .returning({ id: announcements.id });
  // Publishing is the moment worth telling people about, and only the first
  // one: editing a published note is not news.
  if (input.published && !existing.published)
    await announceToEveryone(
      id,
      input.title ?? "",
      input.category ?? "information",
    );
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
