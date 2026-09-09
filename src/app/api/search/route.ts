import { NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { requireMember } from "@/lib/auth/session";
import { bumpMetric } from "@/lib/domain/analytics";
import { searchCatalog } from "@/lib/domain/catalog";
import { detectLocale } from "@/lib/i18n";
import { checkRate, perMinute } from "@/lib/rate-limit";

const schema = z.object({ q: z.string().min(2).max(120) });

/**
 * Catalogue search.
 *
 * Members only: an open search endpoint would hand Umbra's provider quota to
 * anyone who finds the URL.
 */
export async function GET(request: NextRequest) {
  return route(async () => {
    const account = await requireMember();
    checkRate("search", account.id, perMinute(40));

    const { q } = schema.parse({
      q: request.nextUrl.searchParams.get("q") ?? "",
    });
    const locale = detectLocale(request.headers.get("accept-language"));
    const results = await searchCatalog(q, locale);

    await bumpMetric("searches");
    return { results };
  });
}

export const dynamic = "force-dynamic";
