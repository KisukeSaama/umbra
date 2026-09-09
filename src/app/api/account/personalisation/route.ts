import { NextRequest } from "next/server";
import { z } from "zod";

import { jsonBody, route } from "@/lib/api";
import { requireMember } from "@/lib/auth/session";
import { setPersonalisation } from "@/lib/domain/taste";
import { checkRate, perMinute } from "@/lib/rate-limit";

/**
 * Turning personalised suggestions on or off.
 *
 * Off means gone, not hidden: the domain deletes the profile in the same call.
 * That is the only honest reading of a switch about your own data.
 */
const schema = z.object({ enabled: z.boolean() });

export async function POST(request: NextRequest) {
  return route(async () => {
    const account = await requireMember();
    checkRate("personalisation", account.id, perMinute(10));

    const { enabled } = await jsonBody(request, schema);
    await setPersonalisation(account.id, enabled);
    return { enabled };
  });
}
