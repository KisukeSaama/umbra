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
