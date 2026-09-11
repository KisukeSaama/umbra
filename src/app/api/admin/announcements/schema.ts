import { z } from "zod";

import { EMBED_RATIOS } from "@/lib/db/schema";

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
 * The one page a note may set inside itself.
 *
 * https only: a plain http frame inside an https page is blocked by the browser
 * anyway, and saying so here beats a blank rectangle in the feed. See
 * `docs/adr/0018-a-note-can-embed-a-page.md`.
 */
export const embedSchema = z.object({
  url: z
    .url()
    .max(400)
    .refine((value) => value.startsWith("https://"), {
      message: "error.invalidEmbed",
    }),
  title: z.string().max(80).nullish(),
  ratio: z.enum(EMBED_RATIOS).default("wide"),
});
