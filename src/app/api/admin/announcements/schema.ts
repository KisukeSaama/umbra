import { z } from "zod";

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
