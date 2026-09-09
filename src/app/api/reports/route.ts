import { NextRequest } from "next/server";
import { z } from "zod";

import { jsonBody, route } from "@/lib/api";
import { requireMember } from "@/lib/auth/session";
import { REPORT_REASONS } from "@/lib/db/schema";
import { createReport } from "@/lib/domain/reports";
import { detectLocale } from "@/lib/i18n";
import { checkRate, perMinute } from "@/lib/rate-limit";

/**
 * Records a report, or attaches the member to the one that already exists.
 *
 * Everything in the body is a closed set: a kind, a numeric provider id, two
 * optional numbers and a reason out of a fixed list. There is no field here a
 * sentence could ever be typed into, which is the whole point.
 */
const schema = z.object({
  kind: z.enum(["movie", "tv"]),
  providerId: z.string().regex(/^\d+$/),
  seasonNumber: z.number().int().min(0).max(200).nullish(),
  episodeNumber: z.number().int().min(0).max(2000).nullish(),
  reason: z.enum(REPORT_REASONS),
});

export async function POST(request: NextRequest) {
  return route(async () => {
    const account = await requireMember();
    checkRate("reports", account.id, perMinute(5));

    const body = await jsonBody(request, schema);
    const locale = detectLocale(request.headers.get("accept-language"));

    return createReport({
      kind: body.kind,
      providerId: body.providerId,
      seasonNumber: body.seasonNumber ?? null,
      episodeNumber: body.episodeNumber ?? null,
      reason: body.reason,
      accountId: account.id,
      language: locale,
    });
  });
}
