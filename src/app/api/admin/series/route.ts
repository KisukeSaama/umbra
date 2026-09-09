import { NextRequest } from "next/server";
import { z } from "zod";

import { jsonBody, route } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { trackSeries } from "@/lib/domain/series";

const schema = z.object({ providerId: z.string().regex(/^\d+$/) });

/** Puts a series under watch and pulls its calendar straight away. */
export async function POST(request: NextRequest) {
  return route(async () => {
    await requireAdmin();
    const { providerId } = await jsonBody(request, schema);
    return { seriesId: await trackSeries(providerId) };
  });
}
