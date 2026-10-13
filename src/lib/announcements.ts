/**
 * What a note can be, and what shape a page set inside it takes.
 *
 * Two closed lists, and nothing else: the composer offers them, the route
 * validates against them and the schema types its columns with them. They live
 * here rather than beside the tables because the composer is a client
 * component, and a list imported from `@/lib/db/schema` drags Drizzle and the
 * whole schema into the browser bundle with it.
 */

/** The heading a note is filed under, which is also the colour it wears. */
export const ANNOUNCEMENT_CATEGORIES = [
  "information",
  "infrastructure",
  "content",
  "update",
  "storage",
  "funding",
] as const;
export type AnnouncementCategory = (typeof ANNOUNCEMENT_CATEGORIES)[number];

/** The shape of an embedded page: a video, a square, or a tall document. */
export const EMBED_RATIOS = ["wide", "square", "tall"] as const;
export type EmbedRatio = (typeof EMBED_RATIOS)[number];

/**
 * The name of an uploaded visual: the SHA-256 of the stored file, in hex.
 *
 * The same pattern is checked by the route that serves the file, by the routes
 * that attach one to a note and by `announcement_image_check`, so a key is
 * never a path and never anything but a file Umbra wrote itself.
 */
export const UPLOAD_KEY_PATTERN = /^[0-9a-f]{64}$/;

/** The largest picture the composer sends, before Umbra re-encodes it. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Where a stored visual is read from: Umbra itself, members only. */
export function uploadUrl(key: string): string {
  return `/api/uploads/${key}.webp`;
}

/**
 * Whether a pinned note leads the home page at this moment.
 *
 * A pin that has passed its date stops showing on its own, so nothing has to
 * run at the right time to take it down; the query in `domain/announcements`
 * asks the same three things of the database.
 */
export function isFeaturedNow(
  note: {
    featured: boolean;
    published: boolean;
    featuredUntil: Date | null;
  },
  now: Date = new Date(),
): boolean {
  if (!note.featured || !note.published) return false;
  return note.featuredUntil === null || note.featuredUntil > now;
}
