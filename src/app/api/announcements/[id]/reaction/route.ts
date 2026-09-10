import { NextRequest } from "next/server";
import { z } from "zod";

import { idParam, jsonBody, route } from "@/lib/api";
import { requireMember } from "@/lib/auth/session";
import { REACTION_VALUES } from "@/lib/db/schema";
import { setReaction } from "@/lib/domain/reactions";
import { checkRate, perMinute } from "@/lib/rate-limit";

const schema = z.object({ value: z.enum(REACTION_VALUES).nullable() });

/**
 * Sets the visitor's reaction on a note to what the body says, `null` taking it
 * back. The state is sent rather than a toggle, so a retried request lands on
 * the same answer.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return route(async () => {
    const account = await requireMember();
    checkRate("reaction", account.id, perMinute(30));

    const id = await idParam(params);
    const { value } = await jsonBody(request, schema);
    return { reactions: await setReaction(id, account.id, value) };
  });
}
