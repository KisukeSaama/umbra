import { NextRequest } from "next/server";
import { z } from "zod";

import { jsonBody, route } from "@/lib/api";
import { requireMember } from "@/lib/auth/session";
import { createRequest } from "@/lib/domain/requests";
import { detectLocale } from "@/lib/i18n";
import { checkRate, perMinute } from "@/lib/rate-limit";

const schema = z.object({
  kind: z.enum(["movie", "tv"]),
  providerId: z.string().regex(/^\d+$/),
});

/** Records a request. Deduplication and availability checks live in the domain. */
export async function POST(request: NextRequest) {
  return route(async () => {
    const account = await requireMember();
    checkRate("requests", account.id, perMinute(10));

    const { kind, providerId } = await jsonBody(request, schema);
    const locale = detectLocale(request.headers.get("accept-language"));

    return createRequest(kind, providerId, account.id, locale);
  });
}
