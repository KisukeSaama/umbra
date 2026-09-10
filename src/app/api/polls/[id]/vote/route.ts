import { NextRequest } from "next/server";
import { z } from "zod";

import { idParam, jsonBody, route } from "@/lib/api";
import { requireMember } from "@/lib/auth/session";
import { castVote } from "@/lib/domain/polls";
import { checkRate, perMinute } from "@/lib/rate-limit";

const schema = z.object({ optionId: z.string().uuid() });

/** One vote per person: the unique index decides, not the client. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return route(async () => {
    const account = await requireMember();
    checkRate("vote", account.id, perMinute(10));

    const id = await idParam(params);
    const { optionId } = await jsonBody(request, schema);
    return { poll: await castVote(id, optionId, account.id) };
  });
}
