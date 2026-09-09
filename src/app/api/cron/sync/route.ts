import { NextRequest } from "next/server";

import { route } from "@/lib/api";
import { env } from "@/lib/env";
import { NotFoundError, UnauthorizedError } from "@/lib/errors";
import { runSyncCycle } from "@/lib/jobs";

/**
 * Scheduled synchronisation.
 *
 * Called by the worker container (or any scheduler) with the shared secret.
 * Nothing here depends on being called at a precise time: a missed run is
 * caught up by the next one.
 */
export async function POST(request: NextRequest) {
  return route(async () => {
    const secret = env().CRON_SECRET;
    if (!secret) throw new NotFoundError();

    const provided = request.headers
      .get("authorization")
      ?.replace(/^Bearer /i, "");
    if (provided !== secret) throw new UnauthorizedError();

    return { outcomes: await runSyncCycle() };
  });
}

export const dynamic = "force-dynamic";
/** A full library sync can take a while on a large server. */
export const maxDuration = 300;
