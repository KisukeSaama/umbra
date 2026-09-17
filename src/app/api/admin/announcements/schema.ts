import { z } from "zod";

import { EMBED_RATIOS } from "@/lib/db/schema";
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
