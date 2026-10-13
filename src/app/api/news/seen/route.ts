import { NextRequest } from "next/server";
import { z } from "zod";

import { jsonBody, route } from "@/lib/api";
import { requireMember } from "@/lib/auth/session";
import { markNewsSeen } from "@/lib/domain/announcements";
import { checkRate, perMinute } from "@/lib/rate-limit";

/**
 * The member had the news page in front of them, up to the note published at
 * `through`.
 *
 * A write, so it comes through here like every other one rather than out of
 * the page's render: a render can be a prefetch the member never looked at,
 * and only the browser that actually shows the page knows it was shown.
 */
const schema = z.object({ through: z.coerce.date() });

export async function POST(request: NextRequest) {
  return route(async () => {
    const account = await requireMember();
    checkRate("news-seen", account.id, perMinute(30));
    const { through } = await jsonBody(request, schema);
    await markNewsSeen(account.id, through);
    return { seen: true };
  });
}
