import { z } from "zod";

import { EMBED_RATIOS, UPLOAD_KEY_PATTERN } from "@/lib/announcements";
import { parseEmbedCode } from "@/lib/embed";

/**
 * The one outward link a note may carry.
 *
 * This is where a fundraiser lives: Umbra points at the address and never
 * handles what happens there, so nothing beyond an ordinary web address is
 * accepted (see `docs/adr/0010-no-funding-goal.md`).
 */
export const linkSchema = z.object({
  url: z
    .url()
    .max(400)
    .refine(
      (value) => value.startsWith("https://") || value.startsWith("http://"),
      { message: "error.invalidLink" },
    ),
  label: z.string().max(60).nullish(),
});

/**
 * The one page a note may set inside itself, given as the embed code a site
 * offers for integration.
 *
 * Only the frame's address, title and shape are kept from the code. https only:
 * a plain http frame inside an https page is blocked by the browser anyway, and
 * saying so here beats a blank rectangle in the feed. See
 * `docs/adr/0018-a-note-can-embed-a-page.md`.
 */
export const embedSchema = z
  .object({
    code: z.string().max(4000),
    ratio: z.enum(EMBED_RATIOS).optional(),
  })
  .transform((input, context) => {
    const parsed = parseEmbedCode(input.code);
    if (!parsed || parsed.url.length > 1000) {
      context.addIssue({ code: "custom", message: "error.invalidEmbed" });
      return z.NEVER;
    }
    return {
      url: parsed.url,
      title: parsed.title?.slice(0, 80) ?? null,
      ratio: input.ratio ?? parsed.ratio ?? "wide",
    };
  });

/**
 * The visual a note carries: the key of a file the upload route wrote, and the
 * words a screen reader says in its place. Those words are the staff's, like
 * the rest of the note, so nothing a member writes is ever published. They are
 * required: a picture with no description says nothing to whoever cannot see
 * it, and the fundraiser is the note that most needs to be understood.
 */
export const imageSchema = z.object({
  key: z.string().regex(UPLOAD_KEY_PATTERN, { message: "error.imageMissing" }),
  alt: z.string().trim().min(2, { message: "error.imageAltMissing" }).max(200),
});

/**
 * A pin to the top of the home page, with an end date or without one. A date
 * already past would pin a note nobody sees, so it is refused.
 */
export const featureSchema = z.object({
  until: z.coerce
    .date()
    .nullish()
    .transform((value) => value ?? null)
    .refine((value) => value === null || value.getTime() > Date.now(), {
      message: "error.featureEndPast",
    }),
});
