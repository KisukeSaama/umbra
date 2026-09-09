import { NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { requireMember } from "@/lib/auth/session";
import {
  episodesOnServer,
  searchLibrary,
  seasonsOnServer,
} from "@/lib/domain/library";
import { checkRate, perMinute } from "@/lib/rate-limit";

/**
 * Searching what is on the server, rather than what exists in the world.
 *
 * The report flow needs this and only this: you cannot report a title that is
 * not here, so the list to choose from is the local index. It never touches the
 * gateway, which is also why it can afford a looser quota than `/api/search`.
 *
 * With a `providerId` it answers the next question instead: which seasons the
 * server holds, or which episodes of one season.
 */
const schema = z.object({
  q: z.string().max(120).optional(),
  providerId: z.string().regex(/^\d+$/).optional(),
  season: z.coerce.number().int().min(0).max(200).optional(),
});

export async function GET(request: NextRequest) {
  return route(async () => {
    const account = await requireMember();
    checkRate("library-search", account.id, perMinute(60));

    const params = request.nextUrl.searchParams;
    const { q, providerId, season } = schema.parse({
      q: params.get("q") ?? undefined,
      providerId: params.get("providerId") ?? undefined,
      season: params.get("season") ?? undefined,
    });

    if (providerId && season !== undefined)
      return { episodes: await episodesOnServer(providerId, season) };
    if (providerId) return { seasons: await seasonsOnServer(providerId) };

    return { results: await searchLibrary(q ?? "") };
  });
}

export const dynamic = "force-dynamic";
