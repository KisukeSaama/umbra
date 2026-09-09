import { NextRequest } from "next/server";

import { route } from "@/lib/api";
import { safeEquals } from "@/lib/auth/compare";
import { env } from "@/lib/env";
import { NotFoundError, UnauthorizedError } from "@/lib/errors";
import { anyJobRunning, runSyncCycle } from "@/lib/jobs";

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
    if (!provided || !safeEquals(provided, secret))
      throw new UnauthorizedError();

    // A cycle already on its feet, started by hand or by a worker that ran
    // long, is left to finish. Skipping costs one interval; two cycles over
    // the same library cost a fight over the same rows.
    if (await anyJobRunning()) return { skipped: true, outcomes: [] };

    return { outcomes: await runSyncCycle() };
  });
}

export const dynamic = "force-dynamic";
/** A full library sync can take a while on a large server. */
export const maxDuration = 300;
