import { NextRequest } from "next/server";
import { z } from "zod";

import { jsonBody, route } from "@/lib/api";
import { requireStaff } from "@/lib/auth/session";
import { moveQueueItems } from "@/lib/domain/queue-moves";
import { BULK_MOVES } from "@/lib/queue";
import { checkRate, perMinute } from "@/lib/rate-limit";

/**
 * Moves several rows of the request queue at once.
 *
 * A row is a request or a season asked for, which is filed as a report, so each
 * one names its kind. The cap is a page of the queue with room to spare: a
 * selection never spans pages, and a body naming a thousand rows is not one the
 * interface can send.
 *
 * The answer lists the rows the move did not reach, so the client can say how
 * many went through rather than failing the whole selection over one of them.
 */
const schema = z.object({
  move: z.enum(BULK_MOVES),
  adminNote: z.string().max(500).nullish(),
  items: z
    .array(z.object({ kind: z.enum(["request", "ask"]), id: z.uuid() }))
    .min(1)
    .max(50),
});

export async function PATCH(request: NextRequest) {
  return route(async () => {
    const account = await requireStaff();
    checkRate("admin", account.id, perMinute(60));
    const { move, adminNote, items } = await jsonBody(request, schema);
    // A row ticked twice is moved once: the second pass would only be refused.
    const unique = [...new Map(items.map((item) => [item.id, item])).values()];
    return moveQueueItems(unique, move, adminNote);
  });
}
