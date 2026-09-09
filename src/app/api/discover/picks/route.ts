import { NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { requireMember } from "@/lib/auth/session";
import {
  ANIME_STANCES,
  DURATIONS,
  FORMATS,
  MOODS,
} from "@/lib/discovery/moods";
import { guidedSelection } from "@/lib/domain/discovery";
import { bumpMetric } from "@/lib/domain/analytics";
import { detectLocale } from "@/lib/i18n";
import { checkRate, perMinute } from "@/lib/rate-limit";

/**
 * The answer to "I do not know what to watch".
 *
 * Four closed answers in, a small selection out. The enums are enforced here
 * and not only offered in the interface: a closed set is only closed if the
 * boundary says so.
 */
const schema = z.object({
  mood: z.enum(MOODS),
  anime: z.enum(ANIME_STANCES),
  format: z.enum(FORMATS),
  duration: z.enum(DURATIONS),
});

export async function GET(request: NextRequest) {
  return route(async () => {
    const account = await requireMember();
    checkRate("picks", account.id, perMinute(20));

    const params = request.nextUrl.searchParams;
    const choice = schema.parse({
      mood: params.get("mood"),
      anime: params.get("anime"),
      format: params.get("format"),
      duration: params.get("duration"),
    });

    const locale = detectLocale(request.headers.get("accept-language"));
    const selection = await guidedSelection(choice, locale);
    await bumpMetric("discovery_rolls");
    return selection;
  });
}

export const dynamic = "force-dynamic";
