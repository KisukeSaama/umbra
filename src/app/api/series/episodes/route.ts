import { NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { requireMember } from "@/lib/auth/session";
import { seasonEpisodes } from "@/lib/domain/catalog";
import { detectLocale } from "@/lib/i18n";
import { checkRate, perMinute } from "@/lib/rate-limit";

/**
 * One season, unfolded.
 *
 * A title page draws the ladder of seasons on the server, and this answers the
 * next question about one of them: which episodes exist, and which of those are
 * here. It is asked only when a season is opened, so a show with forty seasons
 * costs one call rather than forty.
 */
const schema = z.object({
  providerId: z.string().regex(/^\d+$/),
  season: z.coerce.number().int().min(0).max(200),
});

export async function GET(request: NextRequest) {
  return route(async () => {
    const account = await requireMember();
    checkRate("series-episodes", account.id, perMinute(60));

    const params = request.nextUrl.searchParams;
    const { providerId, season } = schema.parse({
      providerId: params.get("providerId"),
      season: params.get("season"),
    });

    const locale = detectLocale(request.headers.get("accept-language"));
    return { episodes: await seasonEpisodes(providerId, season, locale) };
  });
}

export const dynamic = "force-dynamic";
